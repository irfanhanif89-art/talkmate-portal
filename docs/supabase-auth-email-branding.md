# Supabase Auth Emails — TalkMate Branding Handoff

**Goal:** stop Supabase's default `noreply@mail.app.supabase.io` from sending
magic-link / password-reset / invite / signup-confirmation emails. Replace
them with TalkMate-branded emails sent from `noreply@talkmate.com.au` via
Resend SMTP. Fix applies to **both** the client portal and the sales-rep
portal because they share one Supabase Auth project.

**Why this needs you in the dashboard:** the Supabase Auth SMTP toggle and
email-template editor are not exposed by the MCP tools Claude has. You'll
paste credentials and HTML once; after that, every Supabase-triggered email
is TalkMate-branded automatically.

**Estimated time:** 25–30 minutes total. The work is mechanical — most of
it is paste-and-save.

---

## 0. Pre-flight (5 min)

Confirm these three things before starting. Skip the cutover if any fail.

1. **Resend domain verified for `talkmate.com.au`.** Resend dashboard →
   Domains → `talkmate.com.au` should show SPF, DKIM, and MX checks all
   green. We already send `sales@talkmate.com.au` (proposals) and
   `hello@talkmate.com.au` (transactional) via Resend, so this is already
   true — confirm anyway.

2. **Resend API key in hand.** We need an API key with `Send` permission to
   use as the SMTP password. Resend → API Keys → either reuse the
   `talkmate-portal` key already in Vercel (it works as the SMTP password
   too) or create a new restricted key named `supabase-auth-smtp`. **Do
   not** create a domain-restricted key — Supabase's `From` address may
   end up as a sub-pattern Resend doesn't accept under a tight scope.

3. **Sender mailbox decision.** Recommend `noreply@talkmate.com.au` with
   reply-to `hello@talkmate.com.au`. You don't need to create
   `noreply@talkmate.com.au` as an inbox — Resend will accept it as long
   as the domain is verified. Replies to that address will bounce, which
   is intentional for transactional mail.

---

## 1. Configure Resend as Supabase's SMTP provider (5 min)

Open the Supabase dashboard for project `mdsfdaefsxwrakgkyflr`:
https://supabase.com/dashboard/project/mdsfdaefsxwrakgkyflr/settings/auth

Scroll to **SMTP Settings** and toggle **Enable Custom SMTP** to ON.

Fill these fields exactly:

| Field | Value |
|-------|-------|
| Sender email | `noreply@talkmate.com.au` |
| Sender name | `TalkMate` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | *(paste your Resend API key — starts with `re_`)* |
| Minimum interval between emails per recipient | `60` *(seconds — default is fine)* |

Click **Save**. Supabase will validate the credentials by attempting a
connection. If it fails, recheck the API key value (no leading/trailing
whitespace) and that port 465 is set (not 587).

---

## 2. Replace the email templates (15 min)

Navigate to **Authentication → Email Templates** in the same project:
https://supabase.com/dashboard/project/mdsfdaefsxwrakgkyflr/auth/templates

There are six templates. For each, paste the **Subject** value into the
subject field and the **HTML body** into the body field, then click
**Save**. The default Supabase template variables (`{{ .ConfirmationURL }}`,
`{{ .Email }}`, etc.) work inside the HTML — they're substituted at send
time.

### 2.1 — Magic Link

**Subject:** `Your TalkMate sign-in link`

**HTML body:**
```html
<!doctype html>
<html><body style="font-family: 'Outfit', Arial, sans-serif; background: #f4f5f7; padding: 0; margin: 0;">
  <div style="max-width: 560px; margin: 30px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
    <div style="background: #061322; padding: 18px 24px;">
      <div style="font-family: 'Outfit', Arial, sans-serif; font-size: 18px; font-weight: 800; color: white;">
        TalkMate
      </div>
    </div>
    <div style="padding: 26px 24px; color: #061322; font-size: 14px; line-height: 1.65;">
      <h2 style="margin: 0 0 12px; font-size: 19px; font-weight: 800;">Sign in to TalkMate</h2>
      <p>Hi there,</p>
      <p>Click the button below to sign in to your TalkMate account. This link expires in 1 hour and can only be used once.</p>
      <p style="margin: 22px 0;">
        <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 12px 22px; background: #E8622A; color: white; text-decoration: none; border-radius: 9px; font-weight: 700; font-size: 14px;">Sign in to TalkMate</a>
      </p>
      <p style="font-size: 12px; color: #4A7FBB;">If the button doesn't work, copy and paste this link into your browser:<br><span style="word-break: break-all;">{{ .ConfirmationURL }}</span></p>
      <p style="background: rgba(245, 158, 11, 0.08); border-left: 3px solid #f59e0b; padding: 10px 14px; border-radius: 6px;">
        <strong>Didn't request this?</strong> You can safely ignore this email. Someone may have typed your address by mistake.
      </p>
    </div>
    <div style="padding: 16px 24px; background: #f9fafb; border-top: 1px solid #eef0f3; font-size: 11px; color: #7BAED4;">
      TalkMate Pty Ltd · hello@talkmate.com.au
    </div>
  </div>
</body></html>
```

### 2.2 — Reset Password

**Subject:** `Reset your TalkMate password`

**HTML body:**
```html
<!doctype html>
<html><body style="font-family: 'Outfit', Arial, sans-serif; background: #f4f5f7; padding: 0; margin: 0;">
  <div style="max-width: 560px; margin: 30px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
    <div style="background: #061322; padding: 18px 24px;">
      <div style="font-family: 'Outfit', Arial, sans-serif; font-size: 18px; font-weight: 800; color: white;">
        TalkMate
      </div>
    </div>
    <div style="padding: 26px 24px; color: #061322; font-size: 14px; line-height: 1.65;">
      <h2 style="margin: 0 0 12px; font-size: 19px; font-weight: 800;">Reset your password</h2>
      <p>Hi there,</p>
      <p>We received a request to reset the password on your TalkMate account. Click the button below to set a new password. This link expires in 1 hour.</p>
      <p style="margin: 22px 0;">
        <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 12px 22px; background: #E8622A; color: white; text-decoration: none; border-radius: 9px; font-weight: 700; font-size: 14px;">Reset password</a>
      </p>
      <p style="font-size: 12px; color: #4A7FBB;">If the button doesn't work, copy and paste this link into your browser:<br><span style="word-break: break-all;">{{ .ConfirmationURL }}</span></p>
      <p style="background: rgba(245, 158, 11, 0.08); border-left: 3px solid #f59e0b; padding: 10px 14px; border-radius: 6px;">
        <strong>Didn't request this?</strong> You can safely ignore this email — your password won't change. If you didn't request this and you're worried, reply to this email and we'll investigate.
      </p>
    </div>
    <div style="padding: 16px 24px; background: #f9fafb; border-top: 1px solid #eef0f3; font-size: 11px; color: #7BAED4;">
      TalkMate Pty Ltd · hello@talkmate.com.au
    </div>
  </div>
</body></html>
```

### 2.3 — Invite User

**Subject:** `You've been invited to TalkMate`

**HTML body:**
```html
<!doctype html>
<html><body style="font-family: 'Outfit', Arial, sans-serif; background: #f4f5f7; padding: 0; margin: 0;">
  <div style="max-width: 560px; margin: 30px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
    <div style="background: #061322; padding: 18px 24px;">
      <div style="font-family: 'Outfit', Arial, sans-serif; font-size: 18px; font-weight: 800; color: white;">
        TalkMate
      </div>
    </div>
    <div style="padding: 26px 24px; color: #061322; font-size: 14px; line-height: 1.65;">
      <h2 style="margin: 0 0 12px; font-size: 19px; font-weight: 800;">You've been invited to TalkMate</h2>
      <p>Hi,</p>
      <p>You've been invited to join TalkMate. Click the button below to accept the invitation and set up your account.</p>
      <p style="margin: 22px 0;">
        <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 12px 22px; background: #E8622A; color: white; text-decoration: none; border-radius: 9px; font-weight: 700; font-size: 14px;">Accept invitation</a>
      </p>
      <p style="font-size: 12px; color: #4A7FBB;">If the button doesn't work, copy and paste this link into your browser:<br><span style="word-break: break-all;">{{ .ConfirmationURL }}</span></p>
      <p>If you weren't expecting this invitation, you can safely ignore this email.</p>
    </div>
    <div style="padding: 16px 24px; background: #f9fafb; border-top: 1px solid #eef0f3; font-size: 11px; color: #7BAED4;">
      TalkMate Pty Ltd · hello@talkmate.com.au
    </div>
  </div>
</body></html>
```

### 2.4 — Confirm Signup

**Subject:** `Confirm your TalkMate email`

**HTML body:**
```html
<!doctype html>
<html><body style="font-family: 'Outfit', Arial, sans-serif; background: #f4f5f7; padding: 0; margin: 0;">
  <div style="max-width: 560px; margin: 30px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
    <div style="background: #061322; padding: 18px 24px;">
      <div style="font-family: 'Outfit', Arial, sans-serif; font-size: 18px; font-weight: 800; color: white;">
        TalkMate
      </div>
    </div>
    <div style="padding: 26px 24px; color: #061322; font-size: 14px; line-height: 1.65;">
      <h2 style="margin: 0 0 12px; font-size: 19px; font-weight: 800;">Confirm your email</h2>
      <p>Welcome to TalkMate!</p>
      <p>Click the button below to confirm your email address and finish setting up your account.</p>
      <p style="margin: 22px 0;">
        <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 12px 22px; background: #E8622A; color: white; text-decoration: none; border-radius: 9px; font-weight: 700; font-size: 14px;">Confirm email</a>
      </p>
      <p style="font-size: 12px; color: #4A7FBB;">If the button doesn't work, copy and paste this link into your browser:<br><span style="word-break: break-all;">{{ .ConfirmationURL }}</span></p>
    </div>
    <div style="padding: 16px 24px; background: #f9fafb; border-top: 1px solid #eef0f3; font-size: 11px; color: #7BAED4;">
      TalkMate Pty Ltd · hello@talkmate.com.au
    </div>
  </div>
</body></html>
```

### 2.5 — Change Email Address

**Subject:** `Confirm your new TalkMate email`

**HTML body:**
```html
<!doctype html>
<html><body style="font-family: 'Outfit', Arial, sans-serif; background: #f4f5f7; padding: 0; margin: 0;">
  <div style="max-width: 560px; margin: 30px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
    <div style="background: #061322; padding: 18px 24px;">
      <div style="font-family: 'Outfit', Arial, sans-serif; font-size: 18px; font-weight: 800; color: white;">
        TalkMate
      </div>
    </div>
    <div style="padding: 26px 24px; color: #061322; font-size: 14px; line-height: 1.65;">
      <h2 style="margin: 0 0 12px; font-size: 19px; font-weight: 800;">Confirm your new email</h2>
      <p>Hi,</p>
      <p>You requested to change the email on your TalkMate account. Click the button below to confirm the new address.</p>
      <p style="margin: 22px 0;">
        <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 12px 22px; background: #E8622A; color: white; text-decoration: none; border-radius: 9px; font-weight: 700; font-size: 14px;">Confirm new email</a>
      </p>
      <p style="font-size: 12px; color: #4A7FBB;">If the button doesn't work, copy and paste this link into your browser:<br><span style="word-break: break-all;">{{ .ConfirmationURL }}</span></p>
      <p style="background: rgba(245, 158, 11, 0.08); border-left: 3px solid #f59e0b; padding: 10px 14px; border-radius: 6px;">
        <strong>Didn't request this?</strong> Contact <a href="mailto:hello@talkmate.com.au" style="color: #E8622A;">hello@talkmate.com.au</a> immediately — someone may be trying to take over your account.
      </p>
    </div>
    <div style="padding: 16px 24px; background: #f9fafb; border-top: 1px solid #eef0f3; font-size: 11px; color: #7BAED4;">
      TalkMate Pty Ltd · hello@talkmate.com.au
    </div>
  </div>
</body></html>
```

### 2.6 — Reauthentication

**Subject:** `Confirm it's you on TalkMate`

**HTML body:**
```html
<!doctype html>
<html><body style="font-family: 'Outfit', Arial, sans-serif; background: #f4f5f7; padding: 0; margin: 0;">
  <div style="max-width: 560px; margin: 30px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
    <div style="background: #061322; padding: 18px 24px;">
      <div style="font-family: 'Outfit', Arial, sans-serif; font-size: 18px; font-weight: 800; color: white;">
        TalkMate
      </div>
    </div>
    <div style="padding: 26px 24px; color: #061322; font-size: 14px; line-height: 1.65;">
      <h2 style="margin: 0 0 12px; font-size: 19px; font-weight: 800;">Confirm it's you</h2>
      <p>Hi,</p>
      <p>For security, we need to confirm it's you. Enter the code below in TalkMate to continue.</p>
      <p style="margin: 22px 0; text-align: center;">
        <span style="display: inline-block; padding: 12px 22px; background: #061322; color: white; border-radius: 9px; font-weight: 700; font-size: 22px; letter-spacing: 4px;">{{ .Token }}</span>
      </p>
      <p style="background: rgba(245, 158, 11, 0.08); border-left: 3px solid #f59e0b; padding: 10px 14px; border-radius: 6px;">
        <strong>Didn't try to sign in?</strong> You can safely ignore this email. If you're worried, reply and we'll investigate.
      </p>
    </div>
    <div style="padding: 16px 24px; background: #f9fafb; border-top: 1px solid #eef0f3; font-size: 11px; color: #7BAED4;">
      TalkMate Pty Ltd · hello@talkmate.com.au
    </div>
  </div>
</body></html>
```

---

## 3. Verify (5 min)

Test each path using the QA mailbox `testingtalkmate@gmail.com` so you
never spam a real user.

### 3.1 — Magic Link
1. Open an incognito window, visit `https://app.talkmate.com.au/login`.
2. Enter `testingtalkmate@gmail.com` and click the magic-link option.
3. Open the Gmail inbox at `testingtalkmate@gmail.com`. The email should:
   - Come from `TalkMate <noreply@talkmate.com.au>` (not `mail.app.supabase.io`).
   - Render with the dark `#061322` header and orange `#E8622A` button.
   - Have the subject `Your TalkMate sign-in link`.
4. Click the link — should land on `/auth/callback` and authenticate normally.

### 3.2 — Reset Password
1. Visit `https://app.talkmate.com.au/forgot-password`.
2. Enter `testingtalkmate@gmail.com`, submit.
3. Same checks as above; subject should be `Reset your TalkMate password`.
4. Click link → `/reset-password` → set a new password → see the
   Phase A "Your password was changed" notification email arrive too.

### 3.3 — Invite (admin path)
1. Sign in as admin, go to `/admin/contractors`.
2. Invite a contractor with email `testingtalkmate@gmail.com`.
3. The Supabase invite email subject should be `You've been invited to TalkMate`
   and come from `noreply@talkmate.com.au`. (Note: the contractor invite
   flow also sends a separate Resend email from `hello@talkmate.com.au`
   per Session 44 — these are different emails. Both should arrive.)

### 3.4 — Cleanup after verification
- Delete the test contractor row from `contractors`, `sales_reps`, and
  `contractor_agreements` per the QA mailbox convention.
- Reset `auth.users.encrypted_password` for `testingtalkmate@gmail.com` to
  NULL (see the Test Accounts section of SYSTEM_MAP.md for the SQL).

---

## 4. Rollback

If something breaks (most likely: emails not arriving — Resend SMTP
credentials wrong, or Resend marks the domain as suspended):

1. **Fast path:** Supabase dashboard → Authentication → SMTP Settings →
   toggle **Enable Custom SMTP** to OFF. Emails immediately fall back to
   Supabase's default sender (`mail.app.supabase.io`) — unprofessional
   but functional. Buys time to debug Resend.

2. **Slow path:** Keep custom SMTP enabled, fix the underlying issue
   (Resend dashboard → Logs to see why deliveries failed).

The email templates do not need to be reverted on rollback — Supabase
will keep using them with the default SMTP sender, which still produces
TalkMate-branded HTML (just from `mail.app.supabase.io`).

---

## 5. After this is done

Update `SYSTEM_MAP.md`:
- Add a "Closed in Session N" line under Known Gaps noting "Supabase auth
  emails now branded TalkMate via Resend SMTP".
- Add to the Environment Variables section if you decide to create a
  dedicated `RESEND_AUTH_SMTP_KEY` Vercel env var (optional — only needed
  if you didn't reuse the existing `RESEND_API_KEY`).

---

## Notes / decisions made when drafting this

- **Why `noreply@` and not `hello@`:** Supabase auth emails are
  transactional and tied to flows the user just triggered. Replies should
  go to a monitored inbox; the templates set `reply-to: hello@…` via the
  Supabase SMTP setting (you can configure this in the same form as the
  sender — set the Reply-To explicitly to `hello@talkmate.com.au`).
- **Why we don't use `{{ .Email }}` in the salutation:** Supabase doesn't
  expose first name in template variables for these flows. Hardcoding
  "Hi there" / "Hi" is the standard pattern and reads naturally.
- **Why 1-hour expiry note in copy:** Supabase's default magic-link and
  password-reset TTL is 3600 seconds. If you change the TTL in
  `Auth → Settings → Email`, update the copy to match.
- **Reauthentication uses `{{ .Token }}` not `{{ .ConfirmationURL }}`:**
  Supabase's reauth flow is OTP-based, not link-based.
