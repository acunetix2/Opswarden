"use client";

import { KeyRound, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { PasswordField, passwordProblem } from "@/components/auth/password-field";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { toAppError } from "@/lib/api-error";
import { ROLE_DESCRIPTIONS } from "@/lib/permissions";
import { usesSupabaseAuth } from "@/lib/supabase-auth";
import { useChangePasswordMutation, useUpdateProfileMutation } from "@/store/api";
import { useSession, useToast } from "@/store/hooks";

/** Your own account: display name, sign-in email, password, and the workspaces you belong to. */
export function ProfileView() {
  const toast = useToast();
  const { user, workspaces, workspace } = useSession();
  const [updateProfile, profileState] = useUpdateProfileMutation();
  const [changePassword, passwordState] = useChangePasswordMutation();

  const [name, setName] = useState(user?.full_name ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  useEffect(() => setName(user?.full_name ?? ""), [user?.full_name]);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);

  if (!user) return null;
  const trimmed = name.trim().replace(/\s+/g, " ");
  const nameChanged = trimmed !== user.full_name;

  async function onSaveName(e: FormEvent) {
    e.preventDefault();
    setNameError(null);
    if (!trimmed) return setNameError("Enter your name.");
    try {
      await updateProfile({ full_name: trimmed }).unwrap();
      toast("success", "Profile updated", "Your new name shows across every workspace you're in.");
    } catch (err) {
      setNameError(toAppError(err).message);
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (!current) return setPwError("Enter your current password.");
    const problem = passwordProblem(next);
    if (problem) return setPwError(problem);
    if (next !== repeat) return setPwError("The new passwords don't match.");
    try {
      await changePassword({ current_password: current, new_password: next }).unwrap();
      setCurrent("");
      setNext("");
      setRepeat("");
      toast("success", "Password changed", "Use your new password next time you sign in.");
    } catch (err) {
      setPwError(toAppError(err).message);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Account" title="Your profile" description="How you appear to your team, and how you sign in." />

      <Card>
        <CardHeader icon={<UserRound />} title="Profile" description="Your name appears on cases, approvals and the activity log." />
        <form onSubmit={onSaveName} noValidate>
          <CardBody className="space-y-5">
            <div className="flex items-center gap-4">
              <Avatar name={trimmed || user.email} className="size-14 text-[16px]" />
              <div className="min-w-0">
                <p className="truncate text-[16px] font-semibold text-ink">{trimmed || "Your name"}</p>
                <p className="truncate text-[13px] text-ink-3">{user.email}</p>
              </div>
            </div>
            {nameError ? <Notice tone="danger">{nameError}</Notice> : null}
            <Field label="Full name" htmlFor="profile-name" required>
              <Input id="profile-name" value={name} maxLength={200} autoComplete="name" onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(nameError) || undefined} />
            </Field>
            <Field label="Email" htmlFor="profile-email" hint="This is your sign-in, so it can't be changed here. Ask a workspace admin if it needs to change.">
              <Input id="profile-email" value={user.email} readOnly disabled />
            </Field>
          </CardBody>
          <CardFooter className="justify-end">
            <Button type="button" variant="ghost" disabled={!nameChanged || profileState.isLoading} onClick={() => setName(user.full_name)}>
              Reset
            </Button>
            <Button type="submit" loading={profileState.isLoading} disabled={!nameChanged || !trimmed}>
              Save changes
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader icon={<KeyRound />} title="Password" description="Choose a password you don't use anywhere else." />
        {usesSupabaseAuth ? (
          <CardBody>
            <p className="text-[13.5px] text-ink-2">Your password is managed by your sign-in provider. Use “Forgot password?” on the sign-in page to change it.</p>
          </CardBody>
        ) : (
          <form onSubmit={onChangePassword} noValidate>
            <CardBody className="space-y-4">
              {pwError ? <Notice tone="danger">{pwError}</Notice> : null}
              <PasswordField id="pw-current" label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
              <div className="grid gap-4 sm:grid-cols-2">
                <PasswordField id="pw-new" label="New password" value={next} onChange={setNext} autoComplete="new-password" checkPolicy />
                <PasswordField
                  id="pw-repeat"
                  label="Repeat new password"
                  value={repeat}
                  onChange={setRepeat}
                  autoComplete="new-password"
                  error={repeat && next !== repeat ? "The passwords don't match." : null}
                />
              </div>
            </CardBody>
            <CardFooter className="justify-end">
              <Button type="submit" loading={passwordState.isLoading} disabled={!current || !next || !repeat}>
                Change password
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>

      <Card>
        <CardHeader title="Workspaces" description="Where you're a member, and your role in each. Roles are set by each workspace's admins." />
        <ul className="divide-y divide-line">
          {workspaces.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-medium text-ink">{w.name}</span>
                <span className="block text-[12.5px] text-ink-3">{ROLE_DESCRIPTIONS[w.role].summary}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {w.id === workspace?.id ? <Badge tone="brand">Current</Badge> : null}
                <Badge tone="neutral">{ROLE_DESCRIPTIONS[w.role].label}</Badge>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
