"""Supplier and purchase-order register, plus workspace-wide search.

Anyone in the workspace can read the register. Admins and reviewers maintain it
(Permission.MANAGE_REGISTER). Purchase-order files are validated exactly like
case documents and stored privately; they are only ever streamed to members.
"""
from __future__ import annotations

import hashlib
from collections import defaultdict
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import WorkspaceContext, get_current_user, workspace_context
from app.api.errors import ApiError, conflict, not_found, unprocessable
from app.core.config import settings
from app.core.permissions import Permission, role_has_permission
from app.db import get_db, new_uuid
from app.integrations.storage.provider import get_storage
from app.models.case import Case
from app.models.document import Document
from app.models.finding import Finding
from app.models.registry import PurchaseOrder, Supplier
from app.models.user import User
from app.models.workspace import WorkspaceMember
from app.schemas.registry import (
    PurchaseOrderIn,
    PurchaseOrderOut,
    PurchaseOrderPatch,
    RegisteredSupplierOut,
    SearchHit,
    SearchOut,
    SupplierIn,
    SupplierPatch,
)
from app.schemas.workspace import MoneyAmount
from app.services import audit_service
from app.services.normalization import normalize_reference, normalize_text

router = APIRouter(tags=["registry"])

_CLOSED = {"resolved", "archived"}
_ACTIVE_FINDING = {"open", "confirmed", "needs_review"}


# ---- helpers -----------------------------------------------------------------------


def _ctx_for(db: Session, user: User, workspace_id: str) -> WorkspaceContext:
    member = db.execute(
        select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user.id)
    ).scalar_one_or_none()
    if member is None:
        raise not_found("Workspace")
    return WorkspaceContext(workspace_id=workspace_id, role=member.role, user=user)


def _load_supplier(db: Session, user: User, supplier_id: str) -> tuple[Supplier, WorkspaceContext]:
    s = db.get(Supplier, supplier_id)
    if s is None:
        raise not_found("Supplier")
    try:
        return s, _ctx_for(db, user, s.workspace_id)
    except ApiError:
        raise not_found("Supplier")


def _load_po(db: Session, user: User, po_id: str) -> tuple[PurchaseOrder, WorkspaceContext]:
    po = db.get(PurchaseOrder, po_id)
    if po is None:
        raise not_found("Purchase order")
    try:
        return po, _ctx_for(db, user, po.workspace_id)
    except ApiError:
        raise not_found("Purchase order")


def _clean(v: str | None) -> str | None:
    if v is None:
        return None
    v = " ".join(str(v).split())
    return v or None


def _amount(v: str | None) -> Decimal | None:
    if v is None or not str(v).strip():
        return None
    try:
        d = Decimal(str(v).replace(",", "").strip())
    except InvalidOperation:
        raise unprocessable("INVALID_AMOUNT", "Enter the PO total as a number, e.g. 1250.00.")
    if d < 0:
        raise unprocessable("INVALID_AMOUNT", "The PO total can't be negative.")
    return d.quantize(Decimal("0.01"))


def _money(totals: dict[str, Decimal]) -> list[MoneyAmount]:
    ordered = sorted(totals.items(), key=lambda kv: kv[1], reverse=True)
    return [MoneyAmount(currency=c, amount=str(a.quantize(Decimal("0.01")))) for c, a in ordered if a > 0]


def _supplier_out(s: Supplier, cases: list[Case], findings_by_case: dict[str, list[Finding]], open_pos: int) -> RegisteredSupplierOut:
    exposure: dict[str, Decimal] = defaultdict(Decimal)
    active = 0
    for c in cases:
        if c.status in _CLOSED:
            continue
        for f in findings_by_case.get(c.id, []):
            if f.status in _ACTIVE_FINDING:
                active += 1
                if f.impact_amount is not None:
                    exposure[f.currency or c.currency] += abs(Decimal(str(f.impact_amount)))
    last = max((c.updated_at for c in cases), default=None)
    return RegisteredSupplierOut(
        id=s.id,
        name=s.name,
        supplier_code=s.supplier_code,
        contact_name=s.contact_name,
        contact_email=s.contact_email,
        phone=s.phone,
        default_currency=s.default_currency,
        payment_terms=s.payment_terms,
        address=s.address,
        notes=s.notes,
        is_active=s.is_active,
        open_purchase_orders=open_pos,
        total_cases=len(cases),
        open_cases=sum(1 for c in cases if c.status not in _CLOSED),
        active_findings=active,
        exposure=_money(exposure),
        last_activity_at=last,
        created_at=s.created_at,
    )


def _cases_for_suppliers(db: Session, workspace_id: str, suppliers: list[Supplier]) -> dict[str, list[Case]]:
    """Cases linked to each supplier, by id or (for older cases) by the same name."""
    by_name = {s.normalized_name: s.id for s in suppliers}
    out: dict[str, list[Case]] = defaultdict(list)
    for c in db.execute(select(Case).where(Case.workspace_id == workspace_id)).scalars():
        sid = c.supplier_id if c.supplier_id in {s.id for s in suppliers} else by_name.get(normalize_text(c.supplier_name))
        if sid:
            out[sid].append(c)
    return out


def _po_out(po: PurchaseOrder, supplier_name: str, cases: list[Case]) -> PurchaseOrderOut:
    latest = max(cases, key=lambda c: c.updated_at, default=None)
    return PurchaseOrderOut(
        id=po.id,
        supplier_id=po.supplier_id,
        supplier_name=supplier_name,
        po_number=po.po_number,
        order_date=po.order_date,
        expected_delivery_date=po.expected_delivery_date,
        currency=po.currency,
        total_amount=str(Decimal(str(po.total_amount)).quantize(Decimal("0.01"))) if po.total_amount is not None else None,
        description=po.description,
        status=po.status,
        has_file=bool(po.storage_key),
        original_filename=po.original_filename,
        size_bytes=po.size_bytes,
        case_count=len(cases),
        latest_case_id=latest.id if latest else None,
        created_at=po.created_at,
    )


def _audit(db: Session, ctx: WorkspaceContext, event: str, payload: dict) -> None:
    audit_service.record_event(
        db, workspace_id=ctx.workspace_id, event_type=event, actor_type="user", actor_id=ctx.user.id, payload=payload, commit=False
    )


# ---- suppliers ---------------------------------------------------------------------


@router.get("/workspaces/{workspace_id}/registry/suppliers", response_model=list[RegisteredSupplierOut])
def list_suppliers(
    workspace_id: str,
    include_inactive: bool = False,
    ctx: WorkspaceContext = Depends(workspace_context),
    db: Session = Depends(get_db),
) -> list[RegisteredSupplierOut]:
    ctx.require(Permission.READ_CASE)
    stmt = select(Supplier).where(Supplier.workspace_id == workspace_id)
    if not include_inactive:
        stmt = stmt.where(Supplier.is_active.is_(True))
    suppliers = db.execute(stmt.order_by(Supplier.name)).scalars().all()
    cases = _cases_for_suppliers(db, workspace_id, suppliers)
    findings: dict[str, list[Finding]] = defaultdict(list)
    for f in db.execute(select(Finding).where(Finding.workspace_id == workspace_id)).scalars():
        findings[f.case_id].append(f)
    open_pos: dict[str, int] = defaultdict(int)
    for po in db.execute(
        select(PurchaseOrder).where(PurchaseOrder.workspace_id == workspace_id, PurchaseOrder.status.in_(["open", "received"]))
    ).scalars():
        open_pos[po.supplier_id] += 1
    return [_supplier_out(s, cases.get(s.id, []), findings, open_pos[s.id]) for s in suppliers]


@router.post("/workspaces/{workspace_id}/registry/suppliers", response_model=RegisteredSupplierOut, status_code=201)
def create_supplier(
    workspace_id: str,
    payload: SupplierIn,
    ctx: WorkspaceContext = Depends(workspace_context),
    db: Session = Depends(get_db),
) -> RegisteredSupplierOut:
    ctx.require(Permission.MANAGE_REGISTER)
    name = _clean(payload.name)
    if not name:
        raise unprocessable("NAME_REQUIRED", "Enter the supplier's name.")
    norm = normalize_text(name)
    if db.execute(select(Supplier).where(Supplier.workspace_id == workspace_id, Supplier.normalized_name == norm)).first():
        raise conflict("SUPPLIER_EXISTS", f"{name} is already registered.")
    s = Supplier(
        workspace_id=workspace_id,
        name=name,
        normalized_name=norm,
        supplier_code=_clean(payload.supplier_code),
        contact_name=_clean(payload.contact_name),
        contact_email=str(payload.contact_email).lower() if payload.contact_email else None,
        phone=_clean(payload.phone),
        default_currency=payload.default_currency.upper(),
        payment_terms=_clean(payload.payment_terms),
        address=(payload.address or "").strip() or None,
        notes=(payload.notes or "").strip() or None,
        is_active=payload.is_active,
        created_by=ctx.user.id,
    )
    db.add(s)
    db.flush()
    _audit(db, ctx, "supplier.created", {"supplier_id": s.id, "name": name})
    db.commit()
    return _supplier_out(s, [], {}, 0)


@router.patch("/registry/suppliers/{supplier_id}", response_model=RegisteredSupplierOut)
def update_supplier(
    supplier_id: str, payload: SupplierPatch, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> RegisteredSupplierOut:
    s, ctx = _load_supplier(db, user, supplier_id)
    ctx.require(Permission.MANAGE_REGISTER)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        name = _clean(data["name"])
        if not name:
            raise unprocessable("NAME_REQUIRED", "Enter the supplier's name.")
        norm = normalize_text(name)
        clash = db.execute(
            select(Supplier).where(Supplier.workspace_id == s.workspace_id, Supplier.normalized_name == norm, Supplier.id != s.id)
        ).first()
        if clash:
            raise conflict("SUPPLIER_EXISTS", f"{name} is already registered.")
        s.name, s.normalized_name = name, norm
    for field in ("supplier_code", "contact_name", "phone", "payment_terms"):
        if field in data:
            setattr(s, field, _clean(data[field]))
    for field in ("address", "notes"):
        if field in data:
            setattr(s, field, (data[field] or "").strip() or None)
    if "contact_email" in data:
        s.contact_email = str(data["contact_email"]).lower() if data["contact_email"] else None
    if data.get("default_currency"):
        s.default_currency = data["default_currency"].upper()
    if data.get("is_active") is not None:
        s.is_active = data["is_active"]
    _audit(db, ctx, "supplier.updated", {"supplier_id": s.id, "fields": sorted(data.keys())})
    db.commit()
    cases = _cases_for_suppliers(db, s.workspace_id, [s]).get(s.id, [])
    findings: dict[str, list[Finding]] = defaultdict(list)
    for f in db.execute(select(Finding).where(Finding.case_id.in_([c.id for c in cases]))).scalars() if cases else []:
        findings[f.case_id].append(f)
    open_pos = db.execute(
        select(func.count(PurchaseOrder.id)).where(PurchaseOrder.supplier_id == s.id, PurchaseOrder.status.in_(["open", "received"]))
    ).scalar_one()
    return _supplier_out(s, cases, findings, open_pos)


@router.post("/workspaces/{workspace_id}/registry/suppliers/import-from-cases")
def import_suppliers_from_cases(
    workspace_id: str, ctx: WorkspaceContext = Depends(workspace_context), db: Session = Depends(get_db)
) -> dict:
    """Registers every supplier named in existing cases that isn't registered yet, and links those cases."""
    ctx.require(Permission.MANAGE_REGISTER)
    registered = {
        s.normalized_name: s for s in db.execute(select(Supplier).where(Supplier.workspace_id == workspace_id)).scalars()
    }
    created = 0
    linked = 0
    for c in db.execute(select(Case).where(Case.workspace_id == workspace_id).order_by(Case.created_at)).scalars():
        name = _clean(c.supplier_name)
        if not name:
            continue
        norm = normalize_text(name)
        s = registered.get(norm)
        if s is None:
            s = Supplier(workspace_id=workspace_id, name=name, normalized_name=norm, default_currency=c.currency, created_by=ctx.user.id)
            db.add(s)
            db.flush()
            registered[norm] = s
            created += 1
        if c.supplier_id is None:
            c.supplier_id = s.id
            linked += 1
    if created or linked:
        _audit(db, ctx, "supplier.imported", {"created": created, "linked_cases": linked})
    db.commit()
    return {"created": created, "linked_cases": linked}


# ---- purchase orders ---------------------------------------------------------------


def _pos_with_context(db: Session, workspace_id: str, pos: list[PurchaseOrder]) -> list[PurchaseOrderOut]:
    names = {s.id: s.name for s in db.execute(select(Supplier).where(Supplier.workspace_id == workspace_id)).scalars()}
    by_po: dict[str, list[Case]] = defaultdict(list)
    numbers = {normalize_reference(p.po_number): p.id for p in pos}
    for c in db.execute(select(Case).where(Case.workspace_id == workspace_id)).scalars():
        pid = c.purchase_order_id or numbers.get(normalize_reference(c.supplier_reference))
        if pid:
            by_po[pid].append(c)
    return [_po_out(p, names.get(p.supplier_id, "Unknown supplier"), by_po.get(p.id, [])) for p in pos]


@router.get("/workspaces/{workspace_id}/registry/purchase-orders", response_model=list[PurchaseOrderOut])
def list_purchase_orders(
    workspace_id: str,
    supplier_id: str | None = None,
    status: str | None = None,
    ctx: WorkspaceContext = Depends(workspace_context),
    db: Session = Depends(get_db),
) -> list[PurchaseOrderOut]:
    ctx.require(Permission.READ_CASE)
    stmt = select(PurchaseOrder).where(PurchaseOrder.workspace_id == workspace_id)
    if supplier_id:
        stmt = stmt.where(PurchaseOrder.supplier_id == supplier_id)
    if status:
        stmt = stmt.where(PurchaseOrder.status == status)
    pos = db.execute(stmt.order_by(PurchaseOrder.order_date.desc().nullslast(), PurchaseOrder.created_at.desc())).scalars().all()
    return _pos_with_context(db, workspace_id, pos)


def _supplier_in_workspace(db: Session, workspace_id: str, supplier_id: str) -> Supplier:
    s = db.get(Supplier, supplier_id)
    if s is None or s.workspace_id != workspace_id:
        raise unprocessable("SUPPLIER_NOT_FOUND", "Choose a registered supplier.")
    return s


@router.post("/workspaces/{workspace_id}/registry/purchase-orders", response_model=PurchaseOrderOut, status_code=201)
def create_purchase_order(
    workspace_id: str,
    payload: PurchaseOrderIn,
    ctx: WorkspaceContext = Depends(workspace_context),
    db: Session = Depends(get_db),
) -> PurchaseOrderOut:
    ctx.require(Permission.MANAGE_REGISTER)
    supplier = _supplier_in_workspace(db, workspace_id, payload.supplier_id)
    number = _clean(payload.po_number)
    if not number:
        raise unprocessable("PO_NUMBER_REQUIRED", "Enter the purchase order number.")
    norm = normalize_reference(number)
    if db.execute(select(PurchaseOrder).where(PurchaseOrder.workspace_id == workspace_id, PurchaseOrder.normalized_number == norm)).first():
        raise conflict("PO_EXISTS", f"{number} is already registered.")
    po = PurchaseOrder(
        workspace_id=workspace_id,
        supplier_id=supplier.id,
        po_number=number,
        normalized_number=norm,
        order_date=payload.order_date,
        expected_delivery_date=payload.expected_delivery_date,
        currency=(payload.currency or supplier.default_currency).upper(),
        total_amount=_amount(payload.total_amount),
        description=(payload.description or "").strip() or None,
        status=payload.status,
        created_by=ctx.user.id,
    )
    db.add(po)
    db.flush()
    _audit(db, ctx, "purchase_order.created", {"purchase_order_id": po.id, "po_number": number, "supplier": supplier.name})
    db.commit()
    return _po_out(po, supplier.name, [])


@router.patch("/registry/purchase-orders/{po_id}", response_model=PurchaseOrderOut)
def update_purchase_order(
    po_id: str, payload: PurchaseOrderPatch, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> PurchaseOrderOut:
    po, ctx = _load_po(db, user, po_id)
    ctx.require(Permission.MANAGE_REGISTER)
    data = payload.model_dump(exclude_unset=True)
    if data.get("supplier_id"):
        po.supplier_id = _supplier_in_workspace(db, po.workspace_id, data["supplier_id"]).id
    if "po_number" in data:
        number = _clean(data["po_number"])
        if not number:
            raise unprocessable("PO_NUMBER_REQUIRED", "Enter the purchase order number.")
        norm = normalize_reference(number)
        clash = db.execute(
            select(PurchaseOrder).where(
                PurchaseOrder.workspace_id == po.workspace_id, PurchaseOrder.normalized_number == norm, PurchaseOrder.id != po.id
            )
        ).first()
        if clash:
            raise conflict("PO_EXISTS", f"{number} is already registered.")
        po.po_number, po.normalized_number = number, norm
    for field in ("order_date", "expected_delivery_date", "status"):
        if field in data and (field != "status" or data[field]):
            setattr(po, field, data[field])
    if data.get("currency"):
        po.currency = data["currency"].upper()
    if "total_amount" in data:
        po.total_amount = _amount(data["total_amount"])
    if "description" in data:
        po.description = (data["description"] or "").strip() or None
    _audit(db, ctx, "purchase_order.updated", {"purchase_order_id": po.id, "fields": sorted(data.keys())})
    db.commit()
    return _pos_with_context(db, po.workspace_id, [po])[0]


@router.put("/registry/purchase-orders/{po_id}/file", response_model=PurchaseOrderOut)
async def upload_purchase_order_file(
    po_id: str, file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> PurchaseOrderOut:
    """Attach (or replace) the PO document. New cases opened from this PO get a copy."""
    from app.api.routes.documents import ApiUnsupported, _detect_and_validate

    po, ctx = _load_po(db, user, po_id)
    ctx.require(Permission.MANAGE_REGISTER)
    data = await file.read()
    if not data:
        raise ApiError(400, "EMPTY_FILE", "The uploaded file is empty.")
    if len(data) > settings.max_upload_bytes:
        raise ApiError(413, "FILE_TOO_LARGE", "The uploaded file exceeds the size limit.")
    try:
        mime = _detect_and_validate(file.filename or "upload", file.content_type or "", data)
    except ApiUnsupported:
        raise ApiError(415, "UNSUPPORTED_FILE_TYPE", "This file type is not supported.")
    old_key = po.storage_key
    key = f"{po.workspace_id}_po_{new_uuid()}"
    get_storage().put(key, data)
    po.storage_key = key
    po.original_filename = (file.filename or "purchase-order")[:300]
    po.mime_type = mime
    po.size_bytes = len(data)
    po.sha256 = hashlib.sha256(data).hexdigest()
    _audit(db, ctx, "purchase_order.file_attached", {"purchase_order_id": po.id, "filename": po.original_filename})
    db.commit()
    if old_key:
        # Case copies have their own keys, so removing the old register file can't break a case.
        try:
            get_storage().delete(old_key)
        except Exception:  # noqa: BLE001
            pass
    return _pos_with_context(db, po.workspace_id, [po])[0]


@router.get("/registry/purchase-orders/{po_id}/file")
def download_purchase_order_file(po_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    po, ctx = _load_po(db, user, po_id)
    ctx.require(Permission.READ_CASE)
    if not po.storage_key:
        raise not_found("File")
    return Response(
        content=get_storage().get(po.storage_key),
        media_type=po.mime_type or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{po.original_filename or "purchase-order"}"', "Cache-Control": "no-store"},
    )


def attach_po_file_to_case(db: Session, po: PurchaseOrder, case: Case, actor_id: str) -> Document | None:
    """Copies the registered PO file into `case` as its purchase-order document (own storage key)."""
    if not po.storage_key:
        return None
    data = get_storage().get(po.storage_key)
    key = f"{case.workspace_id}_{new_uuid()}"
    get_storage().put(key, data)
    doc = Document(
        workspace_id=case.workspace_id,
        case_id=case.id,
        document_type="purchase_order",
        storage_key=key,
        original_filename=po.original_filename or f"{po.po_number}.pdf",
        mime_type=po.mime_type or "application/pdf",
        size_bytes=len(data),
        sha256=po.sha256 or hashlib.sha256(data).hexdigest(),
        processing_status="queued",
        uploaded_by=actor_id,
    )
    db.add(doc)
    db.flush()
    audit_service.record_event(
        db,
        workspace_id=case.workspace_id,
        case_id=case.id,
        event_type="document.uploaded",
        actor_type="user",
        actor_id=actor_id,
        payload={"document_id": doc.id, "document_type": "purchase_order", "filename": doc.original_filename, "from_register": po.po_number},
        commit=False,
    )
    return doc


# ---- search ------------------------------------------------------------------------


@router.get("/workspaces/{workspace_id}/search", response_model=SearchOut)
def search(
    workspace_id: str,
    q: str = Query(min_length=1, max_length=100),
    ctx: WorkspaceContext = Depends(workspace_context),
    db: Session = Depends(get_db),
) -> SearchOut:
    """Cases, suppliers, purchase orders, findings and documents matching `q` (a few of each)."""
    ctx.require(Permission.READ_CASE)
    term = q.strip().lower()
    like = f"%{term}%"
    hits: list[SearchHit] = []

    for c in db.execute(
        select(Case)
        .where(
            Case.workspace_id == workspace_id,
            or_(
                func.lower(Case.case_number).like(like),
                func.lower(Case.title).like(like),
                func.lower(Case.supplier_name).like(like),
                func.lower(Case.supplier_reference).like(like),
            ),
        )
        .order_by(Case.updated_at.desc())
        .limit(6)
    ).scalars():
        hits.append(SearchHit(
            kind="case", id=c.id, title=f"{c.case_number} · {c.title}",
            subtitle=" · ".join(x for x in (c.supplier_name, c.supplier_reference) if x) or None,
            href=f"/app/investigations/{c.id}", badge=c.status,
        ))

    for s in db.execute(
        select(Supplier)
        .where(Supplier.workspace_id == workspace_id, or_(func.lower(Supplier.name).like(like), func.lower(Supplier.supplier_code).like(like), func.lower(Supplier.contact_email).like(like)))
        .order_by(Supplier.name)
        .limit(4)
    ).scalars():
        hits.append(SearchHit(
            kind="supplier", id=s.id, title=s.name,
            subtitle=" · ".join(x for x in (s.supplier_code, s.contact_email) if x) or None,
            href=f"/app/suppliers?supplier={s.id}", badge=None if s.is_active else "inactive",
        ))

    names = {s.id: s.name for s in db.execute(select(Supplier).where(Supplier.workspace_id == workspace_id)).scalars()}
    for po in db.execute(
        select(PurchaseOrder)
        .where(PurchaseOrder.workspace_id == workspace_id, or_(func.lower(PurchaseOrder.po_number).like(like), func.lower(PurchaseOrder.description).like(like)))
        .order_by(PurchaseOrder.created_at.desc())
        .limit(4)
    ).scalars():
        hits.append(SearchHit(
            kind="purchase_order", id=po.id, title=po.po_number, subtitle=names.get(po.supplier_id),
            href=f"/app/purchase-orders?po={po.id}", badge=po.status,
        ))

    for f, number in db.execute(
        select(Finding, Case.case_number)
        .join(Case, Case.id == Finding.case_id)
        .where(Finding.workspace_id == workspace_id, func.lower(Finding.title).like(like))
        .order_by(Finding.created_at.desc())
        .limit(4)
    ).all():
        hits.append(SearchHit(
            kind="finding", id=f.id, title=f.title, subtitle=number,
            href=f"/app/investigations/{f.case_id}#finding-{f.id}", badge=f.severity,
        ))

    for d, number in db.execute(
        select(Document, Case.case_number)
        .join(Case, Case.id == Document.case_id)
        .where(Document.workspace_id == workspace_id, func.lower(Document.original_filename).like(like))
        .order_by(Document.created_at.desc())
        .limit(3)
    ).all():
        hits.append(SearchHit(kind="document", id=d.id, title=d.original_filename, subtitle=number, href=f"/app/documents/{d.id}"))

    return SearchOut(query=q, hits=hits)


def can_manage_register(role: str) -> bool:
    return role_has_permission(role, Permission.MANAGE_REGISTER)
