# Repello Privacy Policy — DRAFT

> **Read this box before using this document.**
>
> This is an **engineering draft**, written by reading the Repello source code and database migrations.
> Every factual statement in it is traceable to a specific file and line, recorded in
> `Docs/privacy-data-inventory.md`.
>
> **It has not been reviewed by a lawyer.** It deliberately makes **no claim of compliance** with
> GDPR, UK GDPR, CCPA/CPRA, HIPAA, PIPEDA or any other regulation — it describes what the app does,
> and nothing more. Whether that description is legally sufficient for the markets Repello ships in is
> the owner's responsibility, and should be confirmed with qualified counsel before publication.
>
> Placeholders marked `[OWNER: ...]` must be filled in before this is published. Publishing with
> placeholders intact is worse than having no policy.
>
> **Keep it true.** If a future sprint starts collecting something new — a profile editor, body
> measurements, notes, analytics, notifications — this document and the store forms must change in
> the same sprint. A policy that describes an older version of the app is a liability, not a shield.
>
> **Synced 2026-08-11; product name and free-first posture reconciled 2026-08-21.** Owner-supplied answers from a
> previously rendered working copy were copied back into this repository. That report is not evidence
> that a final public URL is reachable; publication and URL verification remain owner actions. The
> first binary has no monetization or email-recovery flow, and diagnostics remain conditional on the
> exact submitted binary carrying a non-empty Sentry DSN.

---

# Privacy Policy for Repello

**Effective date:** 21 August 2026
**Last updated:** 21 August 2026

> **About in-app purchases in this version.** Repello currently offers **no in-app purchase**, and
> collects no purchase or payment information of any kind. Where this policy describes purchases and
> the payment processor RevenueCat — §2.3, and parts of §4, §5 and §6 — it describes how those will
> work when a paid unlock ships, so the whole picture reads in one place. **None of it happens in the
> version you are using.** When it does, the effective date above will change.

Repello is a strength-training app. You log your workouts, and it shows you what has been happening to
your training. This policy explains what information Repello holds, why, where it lives, and how you
get it back or get rid of it.

It is written to be read. If anything here is unclear, contact us at
qustrike@protonmail.com.

Repello is provided by **Brendan Rodriguez**, an individual based in Florida, United States ("we", "us"). The best way to reach us about anything in this policy is email: qustrike@protonmail.com.

---

## 1. The short version

- We collect **your email address and password** so you can have an account, and **the training data
  you type in** so the app can show it back to you.
- Some of what you enter is **health-adjacent**: your bodyweight, your body measurements, and your
  daily ratings for sleep, energy, soreness and stress. We treat it as sensitive. See §3.
- **We run no product analytics, advertising, attribution, or session recording.** If this exact
  version is configured with crash reporting, a narrowly scoped service may receive privacy-filtered
  diagnostics when the app fails; it receives no account identity or training data. See §2.5.
- **We ask for no device permissions.** No camera, no photos, no microphone, no location, no
  contacts, no notifications, no Apple Health or Google Fit connection.
- **We do not sell your data or share it for advertising**, and we do not use it for profiling.
  Supabase processes account/training data; Sentry does so only if this version is configured for
  diagnostics. RevenueCat does not process data in this free-first version. See §4.
- You can **export your account, training and access data** and **delete your account and its data**
  from inside the app, in a few taps. No email or support ticket is required.

Every one of these statements is checked against the code, not written from memory.

---

## 2. What we collect, and why

### 2.1 Your account

| What | Why | Do you have to? |
| --- | --- | --- |
| **Email address** | It is how you sign in and is shown on the Account screen so you can tell which account you are using on a shared phone. This version does not offer an in-app password-reset flow. | Yes — you cannot have an account without one. |
| **Password** | To prove it is you. | Yes. |
| **A random account identifier** | Every row of your data is tagged with it, so the database can tell your data from everyone else's. | Generated for you. |

**We never store your password.** It goes to our authentication provider, Supabase, which stores a
one-way hash of it — a value that cannot be turned back into your password. Nothing in the app keeps
it after you sign in.

**Password recovery in this version.** The first free-first binary hides the in-app recovery control
until code delivery is configured and a future version explicitly enables it. If that feature is
enabled later, the one-time code is held only in app memory while entered and is never stored.

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
- **Plans and custom exercises** — if you create them. Repello's own built-in exercise library and
  starter plans are our content, not yours, and are not part of your personal data.

We use this to run the app: to show you your history, your progress, your volume and your records,
and to work out what to suggest next. We do not use it for anything else.

### 2.3 Future v1.x purchase and access data

If a future v1.x version offers an optional one-time Repello analysis unlock and you buy it, Apple or Google will
handle the payment. Repello will not receive or store your card or bank details. RevenueCat would
receive the store transaction and your random Repello account identifier so it could report whether
that account bought or restored the unlock. Repello would not send RevenueCat your email, password,
workouts, check-ins, body information, or free-text notes.

In that future version, Supabase would store a small access record for your account: the entitlement
and product identifiers, whether access is granted, the most recent relevant event time, and when the
record was updated. The app could read that record but could not create or change it; only
authenticated server-side purchase events could do so.

### 2.4 Data stored only on your phone

Some things never leave your device and are never sent to us:

- **Your sign-in session** (see §5 for how it is protected).
- **An in-progress workout**, saved locally as you log it, so that if the app is killed mid-session
  you do not lose the sets you have already ticked off. It is cleared when you finish the session,
  sign out, or delete your account.
- **A flag recording that you have seen the first-run introduction**, plus the answers you gave in
  it, so the introduction does not replay every launch. This is treated as a property of the device
  rather than of your account, so signing out does not clear it.

### 2.5 What we do NOT collect

To be specific, because these are the things people reasonably assume an app is doing:

- **No analytics.** There is no analytics SDK in the app. We do not record a screen-usage history,
  how long you use the app, or when you last opened it — beyond what is implied by timestamps on the
  training data you deliberately save. A failure report can identify the code surface that failed,
  as described in §2.5; it does not retain navigation breadcrumbs.
- **No advertising.** No ads, no ad SDK, no advertising identifier (IDFA or Android Advertising ID),
  no App Tracking Transparency prompt, because there is nothing to track.
- **No third-party trackers, pixels, or session replay.**
- **No device permissions.** The app requests none: no camera, photos, microphone, location,
  contacts, calendar, motion sensors, or notifications.
- **No connection to Apple Health, Google Fit or Health Connect.** Every health-adjacent number in
  Repello is one you typed.
- **No social features that transmit anything.** The Social tab in the current version is a preview
  of a planned feature. It makes no network calls and shares nothing.
- **No location.** The app reads your device's timezone locally, only to work out which calendar day
  a check-in belongs to. The resulting date is stored; the timezone is not, and nothing about your
  location is.

Apple and Google collect their own diagnostics at the operating-system and app-store level, under
their own terms and your own device settings. Repello does not receive those diagnostics. Future
purchase reporting through RevenueCat applies only after a paid unlock is introduced, not to this
free-first version.

### 2.5 Crash diagnostics

In a production, non-demo build configured for crash reporting, an app failure may send Sentry a
privacy-filtered diagnostic report. It can include the app/build version, time, platform, OS and
device model/family, code stack frames, a fixed failure category, React component names, and the
method/path/status of a failed network request.

Before a JavaScript report leaves the device, Repello rebuilds it from an allowlist and replaces the
exception text. Reports exclude your account id, email address, IP address, device name, training or
health values, reflections, request/response bodies, screen contents, local runtime values, and URL
query values. Repello does not attach a Sentry user. Screenshots, view hierarchy, session replay,
automatic sessions, performance tracing, failed-request capture and product analytics are disabled.
Development and demo builds do not initialise Sentry at all.

If the exact submitted binary includes a non-empty DSN, Sentry processes these diagnostics so we can
identify and fix failures. The owner must confirm the applicable project region, retention and terms
before publishing this policy for that binary. If the binary has no DSN, Repello does not initialize
Sentry and no Repello diagnostic report leaves the device.

---

## 3. Health-adjacent information

Some of what Repello stores describes your body and how you feel. We call this out separately because
it deserves more care than the rest.

**Daily check-ins.** You can rate your **sleep quality, energy, soreness and stress** on a 1–5 scale.
Every one of these is optional and independent — you can answer one and skip the others, or skip the
whole thing. Blank means blank: an answer you have not given is never filled in with a default or an
average. These ratings feed the app's readiness estimate.

**Body information.** The app's database is built to hold your **bodyweight**, **body-fat
percentage** and **body measurements** (for example waist or chest circumference in centimetres), and
your export includes them if any exist.
Entering them is entirely optional — the app works without a single one.

**What we do with it.** It is used inside the app, for you: trends, readiness, and load suggestions.
It is not used for advertising, not sold, not sent to RevenueCat, and not analysed across users.
Supabase stores it for Repello as described in §4.

**What it is not.** Repello is a training log, not a medical device. Nothing in it is a diagnosis, a
medical opinion, or medical advice, and no health professional sees your data because you use Repello.

---

## 4. Where your data lives, and who processes it

Your account and training data are stored in a **PostgreSQL database hosted by Supabase**, which we
use as our hosting and infrastructure provider. Supabase also operates the authentication service
that holds your email address and your hashed password. They process this data on our instructions in
order to run the service, and for no purpose of their own.

- **Hosting region:** **us-east-1** (United States)
- **Data processing terms with Supabase:** no separate data-processing addendum has been executed; Supabase's standard terms apply.

**Supabase processes account and training data.** It hosts the database, the auth service and the
API the app talks to.

**Sentry conditionally processes restricted crash diagnostics.** This applies only if the exact
submitted binary includes a non-empty DSN. It receives no account identity and no training or health
payload, under the controls described in §2.5.

**RevenueCat processes purchase and entitlement data — once the paid unlock exists** (see the notice
at the top of this policy; nothing in this paragraph applies to the version you are using today). It
would receive the store transaction and the random Repello account identifier described in §2.3 so
Repello can grant or restore the correct account's access. It would not receive training, body,
password, or free-text data from Repello.

**Apple or Google will process payment if a paid unlock is introduced.** The applicable store would
receive the information and purchase history required to complete the transaction under its own
terms. Repello would not receive your payment-card details.

For this free-first version, Supabase is the account/training processor, Sentry is conditional as
described above, and Apple distributes the app. RevenueCat and store payment processing are future
v1.x relationships. We use no analytics vendor, advertising network, data broker, marketing platform,
or support tool that receives your training data.

If you export your data, Repello hands the file to your phone's own share sheet and **you** choose
where it goes — Files, email, a cloud drive, whatever you pick. Once it leaves the app it is covered
by whatever service you sent it to, not by this policy.

International transfers: our database is hosted in the United States (us-east-1). If you use Repello from outside the United States, the information described above is transferred to and stored there.

---

## 5. How your data is protected

We are describing real, verifiable measures here, not aspirations.

- **Every row is locked to its owner in the database itself.** PostgreSQL row-level security is
  enabled on every table, and each policy allows access only to rows belonging to the signed-in
  account. This is enforced by the database on every single query, not by the app being well behaved.
- **The app carries no privileged credential.** This version contains Supabase's public "anon" key
  and may contain a public Sentry DSN. Future monetized versions may contain RevenueCat's public
  platform SDK key. None grants administrative access. Supabase service-role credentials and future
  RevenueCat webhook authorization remain server-only and never enter the app.
- **Your ownership is never taken from the app's word.** When the app saves a workout or a check-in,
  it does not tell the database whose data it is; the database reads that from your verified session.
  A tampered request cannot write into someone else's account.
- **Your sign-in session is kept in the device's secure hardware store** — the iOS Keychain or the
  Android Keystore — not in ordinary app storage. It is marked device-only, so it is excluded from
  iCloud and from encrypted backups restored onto a different device. If a session is only partially
  written (say the app is killed mid-write), it reads as "signed out" rather than as something
  broken.
- **Traffic is encrypted in transit** over HTTPS to Supabase and, if configured, Sentry. Future
  RevenueCat traffic is likewise HTTPS but does not occur in this version.
- **Account deletion is structurally contained.** The one privileged database function that destroys
  data takes no parameters at all: it can only ever delete the account of whoever called it. There is
  no identifier to get wrong and none the server would accept.

No system is perfectly secure, and we do not claim otherwise. If you believe your account has been
compromised, change your password and contact us at qustrike@protonmail.com.

---

## 6. How long we keep it

We keep your account and your training data **for as long as your account exists**. A training log is
only useful if it goes back years, so nothing expires on its own and we do not delete old workouts.

**When you delete your account in this free-first version,** Repello removes your authentication record
and every database row — profile, workouts, exercises, sets, check-ins, body measurements, personal
records, plans, custom exercises and internal access rows — through the authenticated deletion
function and database cascade rules. No RevenueCat customer or purchase history exists for this
version. A future monetized policy will describe processor erasure and store-retained transactions
before that processing is enabled.
There is no soft delete, no recycle bin, and no way for us to restore it afterwards. This is why the
app asks you to confirm twice.

Backups: Supabase takes automated backups of the database under its standard terms. Deleting your account removes your data from the live database immediately; a copy may persist in those rotating backups for a short period afterwards before it is overwritten.

Local device data (the in-progress workout draft and your session) is removed from your device when
you sign out or delete your account, and when you uninstall the app.

---

## 7. Your choices and controls

Both of these are built into the app. Neither requires contacting us.

### Get a copy of your data

**Account → Export my data.**

This produces a single JSON file containing your profile, every workout with all of its exercises and
sets, every check-in, every body measurement, every personal record, any exercises you created, and
your current Repello analysis-unlock entitlement record if one exists.
It is the stored records themselves, not a summary, and it is formatted so a person can read it.
The app then hands it to your phone's share sheet so you can save or send it wherever you like.

The file does not include Repello's own built-in exercise library, because that is our content rather
than yours and several hundred rows of it would bury the handful that are actually yours.
It also does not include internal purchase-event delivery identifiers used only to prevent a
webhook from being processed twice. Those records are not training or account content, are not shown
in the app, and are erased when the account is deleted. You may still ask us for a broader access
response at the contact address below where applicable.

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
- **Password recovery is not offered in this version.** The in-app control remains hidden until email
  code delivery is configured and a future version explicitly enables it. If you cannot access your
  account, contact us using the address below.
- **Ask us anything** at qustrike@protonmail.com. If you would rather we
  handled an export or a deletion for you, or you cannot get into your account, write to us.
  We aim to respond within **30 days**.

Depending on where you live, you may have further rights over your information under local law — such as access, correction, portability, or complaint to a regulator. This policy describes the controls the app gives you directly; it does not limit any right the law gives you.

---

## 8. Children

Repello is not intended for children, and we do not knowingly collect data from them.

- **Minimum age: 13.** Repello is not for anyone younger.
- The app has **no age gate** in the current version — we ask, we do not verify.
- If you believe a child has created an account, contact qustrike@protonmail.com and we will delete it.

---

## 9. Changes to this policy

If we change what Repello collects or what we do with it, we will update this policy and change the
"last updated" date at the top. For a change that materially affects you — collecting a new category
of data, or using existing data for a new purpose — we will tell you in the app before it takes
effect, and where the law requires it, ask for your consent.

Previous versions: we do not publish an archive of earlier versions. The effective date at the top tells you which version you are reading.

---

## 10. Contact

**Brendan Rodriguez**  
Florida, United States  
qustrike@protonmail.com

We have not appointed a data protection officer or an EU/UK representative.

**Governing law:** the State of Florida, United States.

---

## Appendix — For the store submission forms (not part of the published policy)

Delete this appendix before publishing. It is here so whoever fills in the store questionnaires has
the answers to hand.

**Apple — App Privacy / Nutrition Labels**

| Category | Collected? | Linked to identity? | Used for tracking? |
| --- | --- | --- | --- |
| Contact Info → Email Address | **Yes** | Yes | No |
| Health & Fitness → Fitness | **Yes** (workouts, sets, check-in wellbeing ratings) | Yes | No |
| Health & Fitness → Health | **Yes** — body measurements ship (`app/measurement.tsx`) | Yes | No |
| User Content → Other User Content | **Yes** (session reflections — free text you type) | Yes | No |
| Identifiers → User ID | **Yes** (the account identifier) | Yes | No |
| Usage Data | **No** | — | — |
| Diagnostics → Crash Data / Other Diagnostic Data | **Yes** if the build has a Sentry DSN (restricted crash reports, §2.5); **No** if it does not — nothing leaves the device without one | No | No |
| Purchases → Purchase History | **No for this first free-first release.** Reassess before a v1.x paid unlock ships (§2.3) | No | No |
| Location, Contacts, Browsing History, Search History, Financial Info, Sensitive Info, Identifiers → Device ID | **No** | — | — |

Purpose for every collected item: **App Functionality** only. Not Analytics, not Product
Personalization in the advertising sense, not Developer's Advertising or Marketing, not Third-Party
Advertising. **Nothing is used for tracking** as Apple defines it.

**Google Play — Data Safety**

- Data collected: **Personal info → Email address**; **Health and fitness → Fitness info** and
  **Health info** (the submitted app includes writable body measurements); **App activity → Other user-generated content**
  (session reflections); **App info and performance → Crash logs / Diagnostics** (only with a Sentry
  DSN configured); and **Financial info → Purchase history** — the last of which applies **only once
  the Pro unlock ships**, not to the first release.
- Data shared with third parties: Supabase acts as the account/training processor; Sentry is included
  only if the exact binary has a DSN. RevenueCat does not process data in this release.
  `[OWNER: confirm whether the processor relationships present in the exact binary count as "sharing"
  against Google's current Data Safety definitions and current vendor guidance before submitting.]`
- Encrypted in transit: **Yes.**
- Users can request data deletion: **Yes — in-app, Account → Delete account.** Provide the in-app
  path in the form, plus `[OWNER: the web deletion-request URL, which Google also requires.]`
- Data collection is: **required** for the account items, **optional** for check-in ratings,
  reflections and session ratings.
- Independent security review: **No** — none has been commissioned for this release.

**Before submitting either form, re-read `Docs/privacy-data-inventory.md` §7 (dormant columns) and
§8 (what is not collected).** Those two sections are where an answer silently goes stale.
