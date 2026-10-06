# How Aurum protects your project files and data

Written in plain English — this is the answer to *"can our files leak?"*

## 1. Files are never on a public link

Uploaded documents, photos and drawings are **not** stored as web addresses anyone
could stumble on or share. There is no public `/uploads` folder and no
"anyone with the link" URL anywhere in the system.

Every file is served by a single endpoint that, on **every single request**, checks:

1. Are you signed in with a valid, unexpired session? (else 401)
2. Are you a member of the project this file belongs to? (else 403)
3. Does this file actually belong to that project? (else 404)

Only after all three pass are the bytes sent. Copying a file's address and
sending it to an outsider gets them a login screen, not your document.

## 2. Files live inside the database, not on a disk

File contents are stored in the Postgres database itself. This means:

- They are covered by the database's own backups and encryption at rest
- There is no server folder for anyone to browse
- They survive deployments (a serverless server has no permanent disk)

## 3. You can only ever see your own projects

Project membership is checked on the server for every request — not just hidden
in the browser. A user who is not on a project cannot list, open, download or
even confirm the existence of its records. This was tested directly: a
non-member requesting another project's data receives "no access", not data.

## 4. Roles decide what you can do, and the server enforces it

- **Viewer** — can read records and take part in discussions, cannot change anything
- **Commercial Manager** — can create and edit records, upload files
- **Admin** — the above, plus deleting records and managing the team

Hiding a button is not security, so every write is re-checked on the server.
Even a crafted request from outside the app is rejected.

## 5. Accounts are controlled by you

- New sign-ups **cannot log in until an administrator approves them**
- Any account can be deactivated instantly; deactivated users are locked out
  immediately while their history is preserved
- Invitations are single-use, tied to one email address, expire after 7 days,
  and can be revoked at any moment

## 6. Passwords are never stored

Passwords are stored as a one-way bcrypt hash. Nobody — including us and
including anyone who obtained a copy of the database — can read them. Repeated
failed logins are rate-limited to block password guessing.

## 7. Everything is recorded

Every create, edit, status change, deletion **and download** is written to an
audit trail with the person, the time, what changed (before and after values)
and the network address. If a file is ever downloaded, there is a permanent
record of who did it and when.

## 8. Completed projects freeze

Once a project is marked complete it becomes read-only for everyone, including
admins. Historic records cannot be quietly rewritten after the job ends.

---

## Honest limitations

Being straight about the boundaries, because trust depends on it:

- **Anyone you grant access to can read what their role permits.** No software
  prevents an authorised person from taking a screenshot or re-sharing a file
  they were entitled to open. Access control limits *who*, not what an
  authorised person then does. Remove people promptly when they leave a project.
- **Account security depends on password hygiene.** A shared or reused password
  is the most likely route to a leak. Two-factor authentication is not yet
  implemented — it is the single biggest available hardening step.
- **Administrators can see everything**, by design. Grant that role sparingly.
- **Email notifications include an excerpt of comment text**, so anything typed
  into a discussion also travels through the recipients' email providers. Avoid
  putting genuinely sensitive material in comments.
- **Backups and hosting** are handled by Supabase (database) and Vercel
  (application), both of which encrypt data in transit and at rest.

## Recommended next hardening steps

1. Two-factor authentication for administrators
2. A custom domain with properly authenticated email
3. Periodic access reviews — check the member list on each project quarterly
