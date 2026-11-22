# SNAPVERE — audit repozitorija i plan popravaka (2026-11-22)

**Opseg:** `bren-wp/Snapvere`, početno stanje `main` @ `adf2a9d6573b150c932b7ecfe443c975f2519e55`. Pregledana je struktura stabla (352 Git zapisa), reprezentativni sigurnosno osjetljivi Rust/React/JS moduli, browser manifesti, web konfiguracija, GitHub Actions, dostupni statusi buildova i metapodaci izdanja. **Ovo nije dokaz da je svaki redak ili svaki Windows uređaj testiran.** Datum: 22. 11. 2026.

## Sažetak

- **P1 / odvajanje distribucijskih kanala:** `site/config.js` navodi `0.2.4`, a Tauri/Rust repozitorij i GitHub izdanje `v0.2.25`. Kontrolni zbrojevi sva tri EXE/MSI paketa u `site/files/SHA256SUMS.txt` različiti su od SHA-256 vrijednosti u objavljenim GitHub Release metapodacima. **Nemoj automatski zamijeniti web-binarne datoteke:** sam release navodi da snapvere.com trenutačno nudi zasebno .NET/WinUI izdanje, dok je GitHub paket Tauri/Rust i nisu međusobno zamjenjive nadogradnje. Mora postojati jasno razdvajanje naziva/izdanja/preuzimanja i siguran put nadogradnje za svako izdanje. `apps/desktop/src/lib/updateFeed.ts` otvara `https://snapvere.com/download/`; provjeriti prikazuje li stranica odgovarajuće Tauri pakete prije objave Tauri `stable.json` manifesta.
- **P1 / stanje izdanja:** release workflow izričito objavljuje `prerelease: true` i ima završnu provjeru. GitHub API za `v0.2.25` u trenutku audita prikazuje `prerelease: false`, premda release tekst navodi da je ovo preview bez potvrđenih stvarnih Windows testova. Provjeriti je li status ručno promijenjen i vratiti odgovarajuću oznaku dok se testovi ne dovrše.
- **P1 / zaštita grane:** GitHub API za `main` prijavljuje `protected: false`. Postaviti ruleset/branch protection koji zahtijeva uspješne obavezne provjere, review i zabranu force-push brisanja grane. Ova postavka nije promijenjena ovim PR-om.
- **P2 / CI:** `.github/workflows/quality.yml` nije imao `push` za `main`. Ovim PR-om dodan je kako bi i merge commit prolazio kvalitativne provjere. GitHub Release se i dalje pokreće zasebnim, selektivnim workflowom.
- **P2 / analitika prije privole:** `site/analytics.js` čuvao je događaje u memorijskom redu prije izbora, a nakon davanja privole naknadno ih slao Google Analyticsu. Ovim PR-om su isključeni spremanje i naknadno slanje događaja prije privole, uz test prihvaćanja/odbijanja.
- **P2 / nevaljan URL-parametar:** `site/download.js` koristio je `OS_LABEL[q.get("os")]` na objektu s naslijeđenim svojstvima. Vrijednosti `constructor`, `__proto__`, `toString` bile su pogrešno prihvaćene. Popravljeno eksplicitnom provjerom vlastitih ključeva i regresijskim Node testovima.

## Provjere koje postoje i koje su stvarno vidljive

- Posljednji pregledani PR quality run `44978432251` završen je uspješno. `main` nakon spajanja PR-a #42 ima uspješne browser-extension i Windows release workflowove (`44980362639`, `44980362626`). Status builda nije isto što i provjera ponašanja na uređaju.
- `quality.yml` obuhvaća TypeScript, React build, Node testove, Python statičke sigurnosne/policy checkere, npm audit, RustSec, Rust testove i Clippy, SBOM, browser-source usporedbe.
- Tauri konfiguracija ima CSP; capabilities su odvojene po prozorima. Opasnije naredbe provjeravaju izvorni `window.label()`; knjižnica koristi SQLite journal za oporavak brisanja snimki, a izvoz slika ograničava dimenzije i veličinu ulaza.
- Browser manifesti koriste privremeni `activeTab` umjesto trajnog `<all_urls>` host pristupa. Captures su lokalni; `workspace.js` ograničava broj frameova, veličinu slike, trajanje skice i vraća skrolanje u `finally`. Sva stvarna dopuštenja i ponašanje treba potvrditi u konkretnim preglednicima.

## Preostali poslovi, po prioritetu

### P1 — prije stabilnog izdanja

1. **Odabrati strategiju izdanja:** ili javno podržavati dvije jasno imenovane Windows edicije (s odvojenim verzijama, hashima, uputama i update feedovima) ili dovršiti kontroliranu migraciju iz .NET/WinUI u Tauri/Rust. Nikad ne objaviti Tauri verziju u feedu koji korisnike vodi na nekompatibilni .NET instalater. Uključiti provjeru stvarnih datoteka na CDN-u (HTTP status, `Content-Type`, SHA-256 i broj verzije iz binarne datoteke).
2. **Popraviti oznaku izdanja:** `v0.2.25` treba biti prerelease dok real-device QA nije potpisan; release workflow tekst i GitHub status moraju se podudarati.
3. **Zaštititi main:** required quality/frontend + rustsec + native checks, reviews, prevent force-push; review GitHub release permission `contents: write` i environment approval za objavu.
4. **Potpisati distribuciju:** Windows Authenticode za portable/installer; provjeriti potpis nakon izgradnje i prije javnog objavljivanja. SHA-256 potvrđuje integritet, ali samostalno ne potvrđuje izdavača.
5. **Provesti nativni QA:** Windows 10/11 x64, više monitora i DPI 100/125/150/200%, DXGI/GDI fallback, uključena/isključena hardverska akceleracija, WASAPI miks i prebacivanje audio uređaja, pauza/obnova snimanja, prekid sesije, nedostatak diska, offline disk, sleep/resume, neočekivani pad i povrat galerije.
6. **Revidirati web CSP:** sadašnji `site/_headers` i `netlify.toml` ograničavaju frame/object/base/form, ali ne ograničavaju `script-src` i `connect-src`. Projekt ima inline inicijalizacijsku skriptu, dva JSON-LD bloka i privolom kontrolirani GA loader; definirati restriktivni CSP uz testove za JSON-LD i consent, umjesto naslijepo blokirati postojeće funkcije.

### P2 — sigurnost, održavanje, performanse

1. Dodati CI integracijske testove pregleda i preuzimanja web-izdanja, negativne scenarije za URL parametre, pokvarene datoteke i vanjske domene; ovaj PR uvodi prvi test za naslijeđene JavaScript ključeve.
2. Uvesti periodički **read-only** pregled poznatih ranjivosti npm/Cargo ovisnosti, uz evidentirano ručno ažuriranje. Trenutačna dependency politika namjerno zabranjuje automatski Dependabot; to je sigurnosni trade-off, ne automatski propust.
3. Pinati kritične treće GitHub Actions na pune commit SHA, dokumentirati update postupak i minimalne tokene, postaviti CODEOWNERS.
4. Nadopuniti stvarne browser QA matrice: Chrome/Edge/Brave/Opera/Vivaldi, Firefox MV3 i Safari uz Apple native packaging/potpisivanje; provjeriti scroll/capture ograničenja, pop-up navigaciju, high-DPI, tastaturu, touch i locale. Browser ZIP nije isto što i ovjerena store distribucija.
5. Izmjeriti stvarne CPU/GPU/RAM i frame-drop metrike u 1080p/4K/8K snimanju i dugim sesijama; kontrolirati retenciju sličica i operacija u editoru. Bez profiliranja nema temelja za tvrdnju o postignutoj optimizaciji.
6. Provesti pristupačnost: tipkovnica, fokus, screen reader oznake, kontrast, smanjene animacije, tekst na manjim širinama; napraviti referentne snimke stvarne Tauri aplikacije (frontend Playwright snimke nisu zamjena za nativni WebView).
7. Usporediti privacy/EULA tvrdnje s ponašanjem u svakoj ediciji, uključujući IP vidljiv pri provjeri update manifesta, GA samo nakon privole i jasno označavanje nepodržanih platformi.

## Što ovaj PR mijenja

- `site/download.js`: stroga allowlist validacija OS query parametra, bez naslijeđenih svojstava prototipa.
- `tools/tests/downloadOS.test.mjs`: regresijski testovi za valjane, nevaljane i naslijeđene nazive.
- `site/analytics.js`: nema prikupljanja ni replaya događaja prije privole; `tools/tests/analyticsConsent.test.mjs` provjerava pristanak i odbijanje.
- `.github/workflows/quality.yml`: pokretanje kvalitativnih provjera na `main` i izvođenje novih testova.

**Izričito nije promijenjeno:** stari web binarni paketi, objavljena oznaka GitHub Releasea, branch protection, domenski update manifest ni potencijalno nekompatibilni distribucijski kanali. Za to su potrebni odvojeni kontrolirani zahvati.

## Kriteriji za zatvaranje audita

- Za svaki javni kanal dostupan je ispravan binarni paket, SHA-256, verzija, potpis, upute nadogradnje i provjerena poveznica.
- Svi obavezni build/test/security checkovi prolaze na stvarnom merge commitu i pravila repozitorija sprječavaju zaobilaženje.
- QA matrica stvarnog Windows rada i pregledničkih izdanja ima zapisane dokaze i jasne blokere.
- Nema otvorenih P1 stavki; P2 stavke su praćene s vlasnikom i kriterijem prihvaćanja.

## Dopuna audita nakon stvarnih GitHub Actions neuspjeha (2026-11-22)

### Potvrđene greške i uzroci

1. **CI regression testovi na PR #43:** workflow `45068451849`, frontend job `137351194641`, pao je u `tools/tests/analyticsConsent.test.mjs`. Test čita `window.dataLayer` iz zasebnog `node:vm` JavaScript konteksta; `assert.deepStrictEqual` uspoređuje prototipove, pa niz iz drugog realma ne prolazi čak ni kada sadrži iste elemente. Na grani PR #43 dodana je normalizacija `Array.from(window.dataLayer)` u test realm, commit `9f05fbc6463a63208d12851f3191dfe175516619`. Ponovljeni frontend job `137352790014` na commitu prošao je; RustSec i nativne provjere imaju zasebne statusne uvjete.
2. **RustSec, stvarno potvrđena ranjivost:** workflow `45068451849`, security job `137351194750`: `RUSTSEC-2026-0592`, `url 2.5.8` i stack overflow u `Url::origin()` s ugniježđenim `blob:` URL-ovima. RustSec navodi zakrpanu verziju `url >=2.5.9`. Ovisnost je revidirana na odvojenoj grani `fix/tauri-winui-release-channel-0.2.26` (PR #48) s regresijskim pravilom u `tools/check_sqlite_security.py`; zaključani `form_urlencoded` mora biti >=1.2.3 po zahtjevu nove verzije. Na PR #43 ranjiva ovisnost ostaje prisutna dok se sigurnosna promjena iz PR #48 ne uključi; zato je status PR #43 sigurnosno blokiran, bez ikakvog gašenja RustSec skenera.
3. **Neusklađenost Cargo lockfilea:** Windows jobovi `137352974521` i `137352980858` na PR #48 padali su na `cargo test --locked` nakon prve promjene `url` jer novi `url 2.5.9` zahtijeva `form_urlencoded 1.2.3`, a lockfile je još sadržavao `1.2.2`. Commit `56e0d685075852f4956dfd6bcbb44eab8c7e93ee` usklađuje novu transitive verziju i službeni registracijski checksum. **Ponovni zaključani Rust build mora potvrditi popravak.**

### Odvojene provedene cjeline (nije dokaz potpunog audita)

- **PR #48**, https://github.com/bren-wp/Snapvere/pull/48 — Tauri v0.2.26 (izvorni kod, nije izdano), zasebna Tauri download stranica `/download/tauri/` i strogo odvajanje stare web WinUI/.NET v0.2.4 distribucije, regresija update URL-ova, RustSec dependency fix. Nema zamjene postojećih WinUI EXE/MSI paketa ni njihovih SHA-256.
- **PR #49**, https://github.com/bren-wp/Snapvere/pull/49 — stroži CSP s dopuštenim SHA-256 inline skriptama i `tools/check_site_csp.py` regresijom. Početni frontend CI prolazi, ali stvarni preglednici, produkcijski CDN zaglavlja i consent nisu ovdje potvrđeni.

### Neispunjeni release kriteriji

- **Issue #45:** GitHub Release `v0.2.25` još je prema zadnjoj provjeri označen stabilnim, premda u tekstu stoje unsigned preview i nepotpun Windows QA. To nije sukladan release kanal. Promjenu release metapodataka treba provesti autoriziranim GitHub release editom i provjeriti. Nikakvi release asseti nisu zamijenjeni u ovom auditu.
- **Issue #46:** `main` nema potvrđen ruleset/branch protection; bez postavki repozitorija CI se može zaobići. Provjere moraju ostati obavezne na GitHub strani.
- **Issue #47:** hosted CSP, svi browseri, consent accept/decline/revoke i pristupačnost zahtijevaju QA na stvarnim preglednicima.
- **Windows i 7 browser proširenja:** GitHub Actions statički testovi i preview snimke nisu isto što i stvarni Windows 10/11 screenshot/recording/audio/multi-DPI testovi te potpisivanje/odobrenje paketa u trgovinama. Nema vjerodostojnog 1:1 mjerenja referentnih screenshotova ili CPU/RAM/performance before/after mjerenja.

**Status:** PR #43, #48 i #49 su pregledni razvojni zahvati; stabilno izdanje i zatvaranje P1 Issues nisu opravdani sve dok su gore navedeni kriteriji otvoreni.

## 22 November 2026 — zero-telemetry website audit/fix

The website previously included an optional Google Analytics loader, event
tracking code, consent UI, GA host exemptions in both CSP deployments, and
privacy language describing analytics. Those executable paths were removed:
`site/analytics.js` deleted; site JS tracking hooks and consent controls
removed; third-party script, image and connection hosts removed from CSP;
privacy policy updated. Site source/CI guards now reject regression. This
is a source-level hardening result, not proof of hosted network behavior or
third-party hosting log deletion. Desktop native update checks and full i18n
coverage are separate ongoing audit tasks.
