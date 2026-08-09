# PRism Privacy Policy — DRAFT

> **Read this box before using this document.**
>
> This is an **engineering draft**, written by reading the PRism source code and database migrations.
> Every factual statement in it is traceable to a specific file and line, recorded in
> `Docs/privacy-data-inventory.md`.
>
> **It has not been reviewed by a lawyer.** It deliberately makes **no claim of compliance** with
> GDPR, UK GDPR, CCPA/CPRA, HIPAA, PIPEDA or any other regulation — it describes what the app does,
> and nothing more. Whether that description is legally sufficient for the markets PRism ships in is
> the owner's responsibility, and should be confirmed with qualified counsel before publication.
>
> Placeholders marked `[OWNER: ...]` must be filled in before this is published. Publishing with
> placeholders intact is worse than having no policy.
>
> **Keep it true.** If a future sprint starts collecting something new — a profile editor, body
> measurements, notes, analytics, notifications — this document and the store forms must change in
> the same sprint. A policy that describes an older version of the app is a liability, not a shield.

---

# Privacy Policy for PRism

**Effective date:** `[OWNER: effective date]`
**Last updated:** `[OWNER: date]`

PRism is a strength-training app. You log your workouts, and it shows you what has been happening to
your training. This policy explains what information PRism holds, why, where it lives, and how you
get it back or get rid of it.

It is written to be read. If anything here is unclear, contact us at
`[OWNER: contact email for privacy enquiries]`.

PRism is provided by `[OWNER: legal entity name and registered address]` ("we", "us").

---

## 1. The short version

- We collect **your email address and password** so you can have an account, and **the training data
  you type in** so the app can show it back to you.
- Some of what you enter is **health-adjacent**: your bodyweight, your body measurements, and your
  daily ratings for sleep, energy, soreness and stress. We treat it as sensitive. See §3.
- **We run no analytics, no advertising, and no third-party trackers.** There is no advertising
  identifier, no attribution SDK, no session recording and no crash-reporting service in the app.
- **We ask for no device permissions.** No camera, no photos, no microphone, no location, no
  contacts, no notifications, no Apple Health or Google Fit connection.
- **We do not sell or share your data**, and we do not use it for advertising or profiling.
- You can **export everything** and **delete your account and all its data** from inside the app, in
  a few taps. No email, no support ticket, no waiting.

Every one of these statements is checked against the code, not written from memory.

---

## 2. What we collect, and why

### 2.1 Your account

| What | Why | Do you have to? |
| --- | --- | --- |
| **Email address** | It is how you sign in, and how we send you a password-reset code if you lose your password. It is also shown on the Account screen so you can tell which account you are signed in to on a shared phone. | Yes — you cannot have an account without one. |
| **Password** | To prove it is you. | Yes. |
| **A random account identifier** | Every row of your data is tagged with it, so the database can tell your data from everyone else's. | Generated for you. |

**We never store your password.** It goes to our authentication provider, Supabase, which stores a
one-way hash of it — a value that cannot be turned back into your password. Nothing in the app keeps
it after you sign in.

**We never store password-reset codes.** A reset code lives in the app's memory while you are typing
it and is gone the moment the reset finishes.

### 2.2 Your training data

Everything in this section is data **you type in**. None of it is collected in the background, and
none of it is inferred from your device.

- **Workouts** — when a session started and ended, what you called it, and whether you finished it.
- **Exercises and sets** — which movements you did, and for each set: the weight, the reps, how hard
  it felt (RPE), whether you completed it, and how long you rested.
- **Session reflections and ratings** — an optional note in your own words about how a session went,
  and an optional 1–5 rating. Both are entirely up to you; leave them blank and nothing is stored.
- **Personal records** — worked out from the sets you log, and stored so your progress screens are
  fast and stable.
- **Training preferences** — your goal, experience level, how many days a week you train, which days,
  what equipment you have, and whether you prefer kilograms or pounds. Weights are always stored in
  kilograms; the unit setting only changes how they are displayed.
- **Plans and custom exercises** — if you create them. PRism's own built-in exercise library and
  starter plans are our content, not yours, and are not part of your personal data.

We use this to run the app: to show you your history, your progress, your volume and your records,
and to work out what to suggest next. We do not use it for anything else.

### 2.3 Data stored only on your phone

Some things never leave your device and are never sent to us:

- **Your sign-in session** (see §5 for how it is protected).
- **An in-progress workout**, saved locally as you log it, so that if the app is killed mid-session
  you do not lose the sets you have already ticked off. It is cleared when you finish the session,
  sign out, or delete your account.
- **A flag recording that you have seen the first-run introduction**, plus the answers you gave in
  it, so the introduction does not replay every launch. This is treated as a property of the device
  rather than of your account, so signing out does not clear it.

### 2.4 What we do NOT collect

To be specific, because these are the things people reasonably assume an app is doing:

- **No analytics.** There is no analytics SDK in the app. We do not know which screens you open, how
  long you use the app, or when you last opened it — beyond what is implied by the timestamps on the
  training data you deliberately save.
- **No crash reporting.** We do not receive crash or error reports. Errors are written to the
  device's own developer log and go nowhere.
- **No advertising.** No ads, no ad SDK, no advertising identifier (IDFA or Android Advertising ID),
  no App Tracking Transparency prompt, because there is nothing to track.
- **No third-party trackers, pixels, or session replay.**
- **No device permissions.** The app requests none: no camera, photos, microphone, location,
  contacts, calendar, motion sensors, or notifications.
- **No connection to Apple Health, Google Fit or Health Connect.** Every health-adjacent number in
  PRism is one you typed.
- **No social features that transmit anything.** The Social tab in the current version is a preview
  of a planned feature. It makes no network calls and shares nothing.
- **No location.** The app reads your device's timezone locally, only to work out which calendar day
  a check-in belongs to. The resulting date is stored; the timezone is not, and nothing about your
  location is.

Apple and Google collect their own diagnostics at the operating-system and app-store level, under
their own terms and your own device settings. That is outside PRism and we receive nothing from it.

---

## 3. Health-adjacent information

Some of what PRism stores describes your body and how you feel. We call this out separately because
it deserves more care than the rest.

**Daily check-ins.** You can rate your **sleep quality, energy, soreness and stress** on a 1–5 scale.
Every one of these is optional and independent — you can answer one and skip the others, or skip the
whole thing. Blank means blank: an answer you have not given is never filled in with a default or an
average. These ratings feed the app's readiness estimate.

**Body information.** The app's database is built to hold your **bodyweight**, **body-fat
percentage** and **body measurements** (for example waist or chest circumference in centimetres), and
your export includes them if any exist.
`[OWNER: the current release has no screen for entering body measurements — decide before publishing
whether to describe this as a current feature or as one that is coming, and keep this paragraph
matched to what actually ships.]`

**What we do with it.** It is used inside the app, for you: trends, readiness, and load suggestions.
It is not used for advertising, not sold, not shared, and not analysed across users.

**What it is not.** PRism is a training log, not a medical device. Nothing in it is a diagnosis, a
medical opinion, or medical advice, and no health professional sees your data because you use PRism.

---

## 4. Where your data lives, and who processes it

Your account and training data are stored in a **PostgreSQL database hosted by Supabase**, which we
use as our hosting and infrastructure provider. Supabase also operates the authentication service
that holds your email address and your hashed password. They process this data on our instructions in
order to run the service, and for no purpose of their own.

- **Hosting region:** `[OWNER: Supabase project region]`
- **Data processing terms with Supabase:** `[OWNER: state whether a data processing addendum is in
  place]`

**Supabase is the only third party that holds your data.** We use no analytics vendor, no advertising
network, no data broker, no marketing platform and no support tool that receives your training data.

If you export your data, PRism hands the file to your phone's own share sheet and **you** choose
where it goes — Files, email, a cloud drive, whatever you pick. Once it leaves the app it is covered
by whatever service you sent it to, not by this policy.

International transfers: `[OWNER: if the hosting region is outside your users' country, describe the
transfer and its basis. This is a legal question and should be answered with counsel.]`

---

## 5. How your data is protected

We are describing real, verifiable measures here, not aspirations.

- **Every row is locked to its owner in the database itself.** PostgreSQL row-level security is
  enabled on every table, and each policy allows access only to rows belonging to the signed-in
  account. This is enforced by the database on every single query, not by the app being well behaved.
- **The app carries no privileged credential.** The only key inside the app is Supabase's public
  "anon" key, which is designed to be public precisely because row-level security — not the key — is
  what grants access. Administrative and service-role credentials exist only on the server side and
  are never present in, or reachable from, the app.
- **Your ownership is never taken from the app's word.** When the app saves a workout or a check-in,
  it does not tell the database whose data it is; the database reads that from your verified session.
  A tampered request cannot write into someone else's account.
- **Your sign-in session is kept in the device's secure hardware store** — the iOS Keychain or the
  Android Keystore — not in ordinary app storage. It is marked device-only, so it is excluded from
  iCloud and from encrypted backups restored onto a different device. If a session is only partially
  written (say the app is killed mid-write), it reads as "signed out" rather than as something
  broken.
- **Traffic is encrypted in transit** over HTTPS to the Supabase project.
- **Account deletion is structurally contained.** The one privileged database function that destroys
  data takes no parameters at all: it can only ever delete the account of whoever called it. There is
  no identifier to get wrong and none the server would accept.

No system is perfectly secure, and we do not claim otherwise. If you believe your account has been
compromised, change your password and contact us at
`[OWNER: contact email for privacy enquiries]`.

---

## 6. How long we keep it

We keep your account and your training data **for as long as your account exists**. A training log is
only useful if it goes back years, so nothing expires on its own and we do not delete old workouts.

**When you delete your account, it is gone.** Deletion removes your authentication record, and every
row of your data — profile, workouts, exercises, sets, check-ins, body measurements, personal
records, plans, and any custom exercises — is removed with it by the database's own cascade rules.
There is no soft delete, no recycle bin, and no way for us to restore it afterwards. This is why the
app asks you to confirm twice.

Backups: `[OWNER: state your Supabase backup retention period and how long deleted data may persist
in backups before rotating out. Read this from the Supabase project settings — it cannot be
determined from the codebase, and it is a question store reviewers and users do ask.]`

Local device data (the in-progress workout draft and your session) is removed from your device when
you sign out or delete your account, and when you uninstall the app.

---

## 7. Your choices and controls

Both of these are built into the app. Neither requires contacting us.

### Get a copy of your data

**Account → Export my data.**

This produces a single JSON file containing your profile, every workout with all of its exercises and
sets, every check-in, every body measurement, every personal record, and any exercises you created.
It is the stored records themselves, not a summary, and it is formatted so a person can read it.
The app then hands it to your phone's share sheet so you can save or send it wherever you like.

The file does not include PRism's own built-in exercise library, because that is our content rather
than yours and several hundred rows of it would bury the handful that are actually yours.

### Delete your account and everything in it

**Account → Delete account**, then two confirmations.

This permanently erases your account and all of the data described in this policy. Before you
confirm, the app tells you exactly what you are about to lose — the real counts of your workouts,
sets and check-ins — so the decision is made with the numbers in front of you.

**It cannot be undone.** If you might want your history later, export it first. The export control
sits directly above the delete control for that reason.

### Other controls

- **Sign out** from the Account screen. This ends the session and clears local data from the device;
  your account and data are untouched.
- **Change your password** using the "Forgot password" flow on the sign-in screen, which emails you a
  code.
- **Ask us anything** at `[OWNER: contact email for privacy enquiries]`. If you would rather we
  handled an export or a deletion for you, or you cannot get into your account, write to us.
  `[OWNER: state the response time you commit to.]`

`[OWNER: depending on where your users live, they may have additional statutory rights — access,
correction, restriction, objection, portability, and the right to complain to a supervisory
authority. Whether and how to enumerate those here is a legal question. This draft deliberately
describes the controls the app provides rather than asserting any legal entitlement.]`

---

## 8. Children

PRism is not intended for children, and we do not knowingly collect data from them.

- **Minimum age:** `[OWNER: state the minimum age — this must match the age rating declared on the
  App Store and Google Play, and any age gate you implement.]`
- The app has **no age gate** in the current version. `[OWNER: confirm whether one is required for
  your declared age rating and target markets.]`
- If you believe a child has created an account, contact
  `[OWNER: contact email for privacy enquiries]` and we will delete it.

---

## 9. Changes to this policy

If we change what PRism collects or what we do with it, we will update this policy and change the
"last updated" date at the top. For a change that materially affects you — collecting a new category
of data, or using existing data for a new purpose — we will tell you in the app before it takes
effect, and where the law requires it, ask for your consent.

Previous versions: `[OWNER: decide whether to publish an archive of prior versions, and say so here.]`

---

## 10. Contact

`[OWNER: legal entity name]`
`[OWNER: registered address]`
`[OWNER: contact email for privacy enquiries]`

`[OWNER: if you are required to appoint a data protection officer or an EU/UK representative, name
them here. This is a legal question.]`

**Governing law:** `[OWNER: governing jurisdiction]`

---

## Appendix — For the store submission forms (not part of the published policy)

Delete this appendix before publishing. It is here so whoever fills in the store questionnaires has
the answers to hand.

**Apple — App Privacy / Nutrition Labels**

| Category | Collected? | Linked to identity? | Used for tracking? |
| --- | --- | --- | --- |
| Contact Info → Email Address | **Yes** | Yes | No |
| Health & Fitness → Fitness | **Yes** (workouts, sets, check-in wellbeing ratings) | Yes | No |
| Health & Fitness → Health | `[OWNER: yes if body measurements ship]` | Yes | No |
| User Content → Other User Content | **Yes** (session reflections — free text you type) | Yes | No |
| Identifiers → User ID | **Yes** (the account identifier) | Yes | No |
| Usage Data | **No** | — | — |
| Diagnostics | **No** | — | — |
| Location, Contacts, Browsing History, Search History, Purchases, Financial Info, Sensitive Info, Identifiers → Device ID | **No** | — | — |

Purpose for every collected item: **App Functionality** only. Not Analytics, not Product
Personalization in the advertising sense, not Developer's Advertising or Marketing, not Third-Party
Advertising. **Nothing is used for tracking** as Apple defines it.

**Google Play — Data Safety**

- Data collected: **Personal info → Email address**; **Health and fitness → Fitness info** (and
  **Health info** if body measurements ship); **App activity → Other user-generated content**
  (session reflections).
- Data shared with third parties: **None.** Supabase is a processor operating on our behalf, which
  Google's form treats as not "sharing" — `[OWNER: confirm this against the current Data Safety
  guidance before submitting.]`
- Encrypted in transit: **Yes.**
- Users can request data deletion: **Yes — in-app, Account → Delete account.** Provide the in-app
  path in the form, plus `[OWNER: the web deletion-request URL, which Google also requires.]`
- Data collection is: **required** for the account items, **optional** for check-in ratings,
  reflections and session ratings.
- Independent security review: `[OWNER: no, unless one has been commissioned.]`

**Before submitting either form, re-read `Docs/privacy-data-inventory.md` §7 (dormant columns) and
§8 (what is not collected).** Those two sections are where an answer silently goes stale.
