"""Recovery tracking: resolution outcomes, recovered amounts and overview totals."""
from __future__ import annotations

from decimal import Decimal

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.services import recovery_service
from tests.test_api_flow import _login, _seed_two_workspaces


def _ready_case(client, hdr, ws, currency="USD"):
    case = client.post(
        f"/api/v1/workspaces/{ws}/cases", headers=hdr, json={"title": "C", "currency": currency}
    ).json()
    client.post(f"/api/v1/cases/{case['id']}/analyze", headers=hdr)
    return case


def _overview(client, hdr, ws):
    return client.get(f"/api/v1/workspaces/{ws}/overview", headers=hdr).json()["metrics"]


def test_recovered_outcome_records_amount_and_audit(client):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    case = _ready_case(client, hdr, ids["ws_a"])
    r = client.post(
        f"/api/v1/cases/{case['id']}/resolve",
        headers=hdr,
        json={"outcome": "recovered", "recovered_amount": "1,250.5", "comment": "Credit note received"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["resolution_outcome"] == "recovered"
    assert body["recovered_amount"] == "1250.50"
    assert body["resolution_note"] == "Credit note received"

    events = client.get(f"/api/v1/cases/{case['id']}/activity", headers=hdr).json()
    resolved = [e["payload"] for e in events if e["event_type"] == "case.resolved"]
    assert resolved and resolved[0]["outcome"] == "recovered" and resolved[0]["recovered_amount"] == "1250.50"


@pytest.mark.parametrize("outcome", ["no_discrepancy", "written_off"])
def test_non_recovering_outcomes_ignore_amount(client, outcome):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    case = _ready_case(client, hdr, ids["ws_a"])
    r = client.post(
        f"/api/v1/cases/{case['id']}/resolve", headers=hdr,
        json={"outcome": outcome, "recovered_amount": "500"},
    )
    assert r.status_code == 200
    assert r.json()["resolution_outcome"] == outcome
    assert r.json()["recovered_amount"] is None


@pytest.mark.parametrize("bad", ["abc", "-10", "1e40", "12.5.1", "999999999999999999"])
def test_invalid_amount_is_rejected_and_case_stays_open(client, bad):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    case = _ready_case(client, hdr, ids["ws_a"])
    r = client.post(
        f"/api/v1/cases/{case['id']}/resolve", headers=hdr,
        json={"outcome": "recovered", "recovered_amount": bad},
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_AMOUNT"
    assert client.get(f"/api/v1/cases/{case['id']}", headers=hdr).json()["status"] == "needs_review"


def test_unknown_outcome_is_rejected(client):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    case = _ready_case(client, hdr, ids["ws_a"])
    r = client.post(f"/api/v1/cases/{case['id']}/resolve", headers=hdr, json={"outcome": "paid"})
    assert r.status_code == 422


def test_comment_only_clients_still_work(client):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    case = _ready_case(client, hdr, ids["ws_a"])
    r = client.post(f"/api/v1/cases/{case['id']}/resolve", headers=hdr, json={"comment": "Checked"})
    assert r.status_code == 200
    assert r.json()["resolution_outcome"] == "no_discrepancy"


def test_reopen_clears_outcome_and_overview_totals(client):
    ids = _seed_two_workspaces()
    hdr = _login(client, "admin_a@test.io")
    usd = _ready_case(client, hdr, ids["ws_a"], "USD")
    eur = _ready_case(client, hdr, ids["ws_a"], "EUR")
    usd2 = _ready_case(client, hdr, ids["ws_a"], "USD")
    for case, amount in ((usd, "100.10"), (eur, "40"), (usd2, "0.90")):
        assert client.post(
            f"/api/v1/cases/{case['id']}/resolve", headers=hdr,
            json={"outcome": "corrected_invoice", "recovered_amount": amount},
        ).status_code == 200

    metrics = _overview(client, hdr, ids["ws_a"])
    totals = {m["currency"]: m["amount"] for m in metrics["recovered_total"]}
    assert totals == {"USD": "101.00", "EUR": "40.00"}
    assert {m["currency"]: m["amount"] for m in metrics["recovered_in_period"]} == totals

    r = client.post(f"/api/v1/cases/{usd['id']}/reopen", headers=hdr, json={})
    assert r.status_code == 200
    body = r.json()
    assert body["resolution_outcome"] is None and body["recovered_amount"] is None and body["resolution_note"] is None
    totals = {m["currency"]: m["amount"] for m in _overview(client, hdr, ids["ws_a"])["recovered_total"]}
    assert totals == {"USD": "0.90", "EUR": "40.00"}

    # Another workspace never sees these totals.
    other = _login(client, "admin_b@test.io")
    assert _overview(client, other, ids["ws_b"])["recovered_total"] == []


_amounts = st.decimals(min_value=Decimal("0"), max_value=Decimal("99999999"), places=2, allow_nan=False)


@settings(max_examples=200, deadline=None)
@given(st.lists(st.tuples(st.sampled_from(["USD", "EUR", "KES"]), st.one_of(st.none(), _amounts)), max_size=40))
def test_property_totals_equal_per_case_sum(rows):
    totals = recovery_service.sum_recovered(rows)
    for currency in {"USD", "EUR", "KES"}:
        expected = sum((a for c, a in rows if c == currency and a is not None), Decimal("0"))
        assert totals.get(currency, Decimal("0")) == expected


@settings(max_examples=200, deadline=None)
@given(_amounts)
def test_property_amount_round_trips_to_cents(amount):
    parsed = recovery_service.parse_recovered_amount("recovered", str(amount))
    assert parsed == amount.quantize(Decimal("0.01"))
    assert recovery_service.parse_recovered_amount("written_off", str(amount)) is None
