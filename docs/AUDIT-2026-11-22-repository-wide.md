# SNAPVERE — audit repozitorija i plan popravaka (2026-11-22)

**Opseg:** `bren-wp/Snapvere`, početno stanje `main` @ `adf2a9d6573b150c932b7ecfe443c975f2519e55`. Pregledana je struktura stabla (352 Git zapisa), reprezentativni sigurnosno osjetljivi Rust/React/JS moduli, browser manifesti, web konfiguracija, GitHub Actions, dostupni statusi buildova i metapodaci izdanja. **Ovo nije dokaz da je svaki redak ili svaki Windows uređaj testiran.** Datum: 22. 11. 2026.

## Sažetak

- **P1 / odvajanje distribucijskih kanala:** `site/config.js` navodi `0.2.4`, a Tauri/Rust repozitorij i GitHub izdanje `v0.2.25`. Kontrolni zbrojevi sva tri EXE/MSI paketa u `site/files/SHA256SUMS.txt` različiti su od SHA-256 vrijednosti u objavljenim GitHub Release metapodacima. **Nemoj automatski zamijeniti web-binarne datoteke:** sam release navodi da snapvere.com trenutačno nudi zasebno .NET/WinUI izdanje, dok je GitHub paket Tauri/Rust i nisu međusobno zamjenjive nadogradnje. Mora postojati jasno razdvajanje naziva/izdanja/preuzimanja i siguran put nadogradnje za svako izdanje. `apps/desktop/src/lib/updateFeed.ts` otvara `https://snapvere.com/download/`; provjeriti prikazuje li stranica odgovarajuće Tauri pakete prije objave Tauri `stable.json` manifesta.
- **P1 / stanje izdanja:** release workflow izričito objavljuje `prerelease: true` i ima završnu provjeru. GitHub API za `v0.2.25` u trenutku audita prikazuje `prerelease: false`, premda release tekst navodi da je ovo preview bez potvrđenih stvarnih Windows testova. Provjeriti je li status ručno promijenjen i vratiti odgovarajuću oznaku dok se testovi ne dovrše.
- **P1 / zaštita grane:** GitHub API za `main` prijavljuje `protected: false`. Postaviti ruleset/branch protection koji zahtijeva uspješne obavezne provjere, review i zabranu force-push brisanja grane. Ova postavka nije promijenjena ovim PR-om.
- **P2 / CI:** `.github/workflows/quality.yml` nije imao `push` za `main`. Ovim PR-om dodan je kako bi i merge commit prolazio kvalitativne provjere. GitHub Release se i dalje pokreće zasebnim, selektivnim workflowom.
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
- `.github/workflows/quality.yml`: pokretanje kvalitativnih provjera na `main` i izvođenje novih testova.

**Izričito nije promijenjeno:** stari web binarni paketi, objavljena oznaka GitHub Releasea, branch protection, domenski update manifest ni potencijalno nekompatibilni distribucijski kanali. Za to su potrebni odvojeni kontrolirani zahvati.

## Kriteriji za zatvaranje audita

- Za svaki javni kanal dostupan je ispravan binarni paket, SHA-256, verzija, potpis, upute nadogradnje i provjerena poveznica.
- Svi obavezni build/test/security checkovi prolaze na stvarnom merge commitu i pravila repozitorija sprječavaju zaobilaženje.
- QA matrica stvarnog Windows rada i pregledničkih izdanja ima zapisane dokaze i jasne blokere.
- Nema otvorenih P1 stavki; P2 stavke su praćene s vlasnikom i kriterijem prihvaćanja.
