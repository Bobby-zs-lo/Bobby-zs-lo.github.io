# Legegruppe — design

**Dato:** 2026-08-17
**Status:** Godkendt design, klar til implementeringsplan
**Placering i produktion:** `https://bobbylo.dk/legegruppe/`

---

## 1. Problemet

En legegruppe er 4–5 børn fra samme skoleklasse som mødes 1–2 gange om måneden, uafhængigt af venskaber, og som blandes på ny hver 3.–6. måned. Det svære er ikke børnene — det er forældrenes vilkår, som er stærkt ujævne:

- nogle har rigeligt overskud og kan lægge hus til ofte
- nogle kan kun helt bestemte ugedage
- nogle kan gerne have børnene hjemme, men kan ikke hente fire børn fra skole
- nogle er alene med flere børn og kan slet ikke være vært

Et almindeligt "hvor meget overskud har du?"-skema kollapser disse akser til ét tal og mister dermed præcis den information problemet handler om. Appen skal opsamle akserne hver for sig, danne grupper der kan fungere for alle involverede forældre, og foreslå hvem der afholder hvilket møde i hvilken uge.

**Rangordning af hensyn:** forældrenes vilkår vejer tungest. Et barn placeres hellere i en gruppe med mindre spændende blanding end i en gruppe hvor ingen forælder kan få det hentet.

## 2. Omfang

**Version 1 (dette dokument):** én klasse, Bobby er eneste administrator. Forældre svarer via personligt link uden konto.

**Bevidst forberedt, ikke bygget:** alt persisteret data bærer `class_id`, og alle backend-kald tager `classId`. Skalering til flere klasser (trin 2) skal derfor kun ændre adgangskontrol — ikke datamodel eller algoritme.

**Uden for omfang:** brugerkonti, login, betaling, app-butikker, notifikationer, chat, billeddeling, konkrete kalenderdatoer (runden arbejder i ugenumre).

## 3. Arkitektur

Statisk frontend på GitHub Pages i site-repoet, samme mønster som `timer/` og `race/`, men stylet på hovedsitets designsystem frem for sit eget univers.

```
legegruppe/
  index.html            forældrenes spørgeskema
  plan/index.html       den udgivne plan
  admin/index.html      administration
  css/
    legegruppe.css      komponenter, bygger på site-tokens
  js/
    api.js              Apps Script-klient, retry, lokal kø
    model.js            datatyper, normalisering, validering
    constraints.js      hårde krav H1–H5 + uafhængig verifikator
    scoring.js          bløde mål og vægte
    solvers/
      index.js          fælles kontrakt, solver-valg
      heuristic.js      solver A
      exact.js          solver B (lazy-loader GLPK-wasm)
      rota.js           værtsrotation, fælles for A og B
      infeasibility.js  find mindste mængde krav der skal lempes
    ui/
      form.js  admin.js  plan.js
  tests/
    ...                 enhedstests, verifikator, 1000-simulationer
```

**Backend:** Google Apps Script Web App → ét privat Google Sheet ejet af Bobby. Samme mønster som den eksisterende receipts-app.

Faner i arket:

| Fane | Indhold |
|---|---|
| `families` | `class_id`, `family_id`, `token`, kontaktnavn, kontakt, kapacitetsfelter, blackout-uger, note, `updated_at`, `consent_at` |
| `children` | `class_id`, `child_id`, `family_id`, fornavn, evt. efternavns-initial |
| `rounds` | `class_id`, `round_id`, uge-interval, kadence, gruppestørrelse, status (kladde/udgivet), solver brugt, vægte, JSON-resultat |
| `pairs_history` | `class_id`, `child_a`, `child_b`, `round_id` — ét par per række, skrives ved udgivelse |
| `blocked_pairs` | `class_id`, `child_a`, `child_b`, note — kun admin |

**Adgang:** admin via delt passphrase i `doPost`, som i receipts-appen. Forældre via et tilfældigt, ikke-gætteligt `token` i URL'en (`/legegruppe/?f=<token>`), der fungerer som både identifikation og redigeringsnøgle.

**Solver-kontrakt:** begge solvere implementerer samme signatur, så de kan byttes bag én knap.

```js
solve(problem, { seed, timeBudgetMs, weights, locks }) → {
  status: 'ok' | 'infeasible',
  groups,        // [{ id, childIds, why: [...] }]
  score,         // { total, perObjective: {...} }
  explanation,   // menneskelæsbare linjer
  blockers,      // kun ved 'infeasible'
  meta           // { solver, runtimeMs, seed, iterations }
}
```

`rota.js` kører bagefter på resultatet og er fælles for begge solvere — der er ingen grund til to implementeringer af noget så småt.

## 4. Spørgeskemaet

Princip: **ét spørgsmål = én akse.**

**Kernespørgsmål, altid synlige:**

1. Hvor mange gange i en periode kan I lægge hus til? `0 · 1 · 2 · 3+`
2. Hvor mange børn kan I have hjemme? `kan ikke · 2 · 3 · 4 · 5+`
3. Hvilke hverdage passer jer? `man–fre`, flervalg
4. Hvor mange børn kan I hente fra skole? `0 (skal bringes til os) · 1–2 · 3 · 4–5`

**Foldet ud under "flere detaljer", frivilligt:**

5. Mødested: `hjemme hos os` · `vi kan tage gruppen på legepladsen/i parken` · `aftales indbyrdes`
6. Uger vi ikke kan (ferie) — ugevælger
7. Praktisk at vide: husdyr, allergier, "vi kan kun hvis børnene bliver bragt", fritekst
8. Kontakt (mail eller mobil) + samtykke-afkryds

Spørgsmål 5 er det der lader en forælder bidrage uden et hjem der kan rumme fem børn.

**Afledte felter** brugt af algoritmen: `hostCapacity` (møder per runde), `maxChildrenAtHome`, `availableWeekdays` (mængde), `fetchCapacity`, `blackoutWeeks`, `canHostOutdoor`, `requiresChildrenBrought`.

## 5. Hårde krav (H)

En løsning der bryder blot ét af disse er ikke en løsning.

| Id | Krav |
|---|---|
| H1 | Ingen par fra `blocked_pairs` i samme gruppe |
| H2 | Gruppestørrelse 4–5 (konfigurerbart interval) |
| H3 | Gruppen har mindst én familie der kan afholde et møde — hjemme (`maxChildrenAtHome ≥ gruppestørrelse − 1`) eller ude (`canHostOutdoor`) |
| H4 | Gruppen deler mindst én hverdag hvor både vært og hentere kan |
| H5 | Gruppens samlede hentekapacitet dækker de børn der skal transporteres på mødedagen; familier med `requiresChildrenBrought` tæller ikke som hentere |

## 6. Bløde mål (S)

Alle normaliseres til 0–1 og vægtes. Vægtene er skydere i admin; værdierne nedenfor er standard.

| Id | Mål | Standardvægt |
|---|---|---|
| S1 | **Nye legekammerater** — minimér antal par der allerede findes i `pairs_history` | 1.00 |
| S2 | **Robusthed** — foretræk grupper med flere mulige værter og flere fælles dage, så én sygdom ikke vælter runden | 0.70 |
| S3 | **Byrdespredning** — minimér skævhed i værtsroller målt *relativt til hver families egen angivne kapacitet*, ikke mod et fladt gennemsnit | 0.70 |
| S4 | **Ugedagsbredde** — antal fælles hverdage i gruppen | 0.40 |
| S5 | **Kapacitetsspredning** — undgå at samle alle høj-kapacitets-familier i én gruppe | 0.40 |

**Ingen skam-mekanik.** Appen viser aldrig en rangliste over hvem der bidrager mest eller mindst, hverken til forældre eller admin. S3 fordeler byrden inden for det folk selv har sagt de kan — den måler ikke villighed.

## 7. Solverne

Solvervalget rammer **kun gruppedannelsen**. Rotationen (afsnit 8) er fælles.

### A — heuristik (standard)

1. Konstruér en startløsning der opfylder H1–H5 (grådig, kapacitetstungeste familier fordeles først).
2. Lokal søgning: byt to børn mellem grupper, eller flyt ét barn. Afvis træk der bryder et hårdt krav.
3. Simulated annealing med faldende temperatur, seed-styret så samme input giver samme output.
4. Stop ved `timeBudgetMs` (standard 200 ms) eller konvergens; returnér bedste fundne.

Kører i hovedbundtet, ingen ekstra download.

### B — eksakt, set partitioning

1. Opregn alle delmængder af størrelse 4–5 der opfylder H1–H5 → kolonner. Ved 24 børn: `C(24,4) + C(24,5) = 53.130`.
2. Hver kolonne får en omkostning = vægtet blød score for den gruppe.
3. ILP: minimér samlet omkostning, med bibetingelse at hvert barn dækkes præcis én gang.
4. Løses med GLPK-wasm, lazy-loadet — forældresiden downloader det aldrig.

**Størrelsesgrænse:** over 32 børn eksploderer kolonneantallet. Appen skal da sige det ærligt og tilbyde A i stedet — aldrig fryse browseren.

**Vigtigt forbehold:** B er optimal *for de vægte der er sat*, ikke "det rigtige svar". Admin skal formulere det sådan, så resultatet ikke får falsk autoritet.

### Sammenligning

Admin kan køre begge og se dem side om side: score, køretid, og hvilke børn der konkret er placeret forskelligt. At de to ofte ligner hinanden er i sig selv nyttig information.

## 8. Værtsrotationen

Input: grupper + ugeinterval (fx uge 34–47) + kadence (1–2 møder/måned → typisk 6 møder per gruppe).

Output per møde: **ugenummer · ugedag · vært · mødested · henter(e)**.

Regler:
- ferieuger fra `blackoutWeeks` springes over for den familie de gælder
- ingen familie overskrider sit eget `hostCapacity` for runden
- værtsrollen roterer så jævnt som kapaciteten tillader
- hentere vælges per møde blandt dem der kan den ugedag, og roterer også
- mødesteder der ikke er et hjem (legeplads/park) er lovlige værtsmøder
- "aftales indbyrdes" er en gyldig transportværdi og vises som sådan i planen

## 9. Uløselighed

Det vigtigste enkeltstykke i appen. Ved fejl returneres aldrig "ingen løsning fundet", men den **mindste mængde krav der skal lempes** for at nå en løsning, formuleret på dansk:

> Kan ikke danne 5 grupper. Kun 3 familier kan hente 4+ børn, og de kan alle kun torsdag. Enten skal én gruppe mødes på legepladsen, eller også skal én familie kunne en dag mere.

Implementeres ved at slække ét hårdt krav ad gangen (og derefter parvis) og se hvilken lempelse der gør problemet løsbart. **H1 (forbudte par) slækkes aldrig** — den er ikke en logistisk parameter og må ikke foreslås lempet. Resultatet skal pege på en konkret, handlingsbar samtale med én forælder.

## 10. Brugerflader

### Forældre — spørgeskema (`/legegruppe/`)

Ét link i Aula, ingen konto. Fire kernespørgsmål på én skærm, resten foldet væk; under to minutter at udfylde. Kvitteringsside viser **det personlige link**, som også sendes i en bekræftelsesmail, fordi links bliver væk.

Samme link åbner ens egne svar igen. Opdatering er en kernefunktion, ikke en tilføjelse. Ændres noget efter en runde er udgivet, får admin en notits — **planen ændres aldrig automatisk.** Ingen skal opdage tirsdag morgen at deres gruppe er skiftet.

Mobil først.

### Admin (`/legegruppe/admin/`)

Bag passphrase. Fire funktioner:

1. **Status** — hvem har svaret, hvem mangler, med færdig rykkertekst til Aula.
2. **Forbudte par** — kun her, kun admin.
3. **Kør runde** — sæt uger, gruppestørrelse, kadence, vægte; vælg solver A eller B; kør; se resultat med begrundelser.
4. **Juster og udgiv** — træk et barn til en anden gruppe, lås det fast, kør igen; solveren optimerer rundt om låsene. Bryder et manuelt træk et hårdt krav, siges det tydeligt, men det forhindres ikke. Administrator ved ting om klassen som intet skema opsamler.

Udgivelse fryser runden og skriver parrene til `pairs_history`.

### Plan (`/legegruppe/plan/?f=<token>`)

Egen gruppe øverst: børnene, forældrenes kontakt, og en ugetidslinje med egne værtsuger markeret. Hele klassens plan foldet ud nedenunder. Print-venlig A4 og en "kopiér som tekst"-knap til Aula.

## 11. Design

Hovedsitets tokens, uændret: `--paper #FBFAF7`, `--ink #1A1614`, `--accent #C4302B` (Lancet-rød), `--ochre #C9A96E`; Fraunces til overskrifter, Inter til brødtekst, JetBrains Mono til ugenumre og etiketter. Hårfine regler frem for slagskygger, pilleformede knapper, gruppekort med tydeligt hierarki. Det skal ligne bobbylo.dk, ikke et SaaS-dashboard.

Tilgængelighed: WCAG 2.2 AA, fuld tastaturnavigation, synlige fokusmarkeringer, `prefers-reduced-motion` respekteres, kontrast verificeret.

## 12. Privatliv

Data om mindreårige. Minimum er princippet, ikke en eftertanke.

- **Gemmes:** barnets fornavn (+ evt. efternavns-initial), forælderens fornavn, én kontaktkanal, ugedage, kapacitetsfelter, fritekstnote, samtykketidspunkt.
- **Gemmes ikke:** adresser, CPR, fødselsdatoer, billeder.
- `noindex` på hele `/legegruppe/`. Ingen analytics, ingen tredjeparts-scripts.
- Personlige links er kryptografisk tilfældige nøgler.
- Samtykke er et aktivt afkryds med én sætning om hvad der gemmes og hvor længe.
- Sletning: én knap sletter hele klassens data ved skoleårets slut; enkelte familier kan slettes på anmodning.
- **Forbudte par udstilles aldrig** — hverken direkte eller ved at kunne udledes af en udgivet plan. Planen viser resultatet, aldrig begrundelsen.

## 13. Fejlhåndtering

- Apps Script utilgængelig: skemaet gemmer lokalt og prøver igen, så ingen mister sit arbejde.
- Admin henter ét snapshot og kører solveren lokalt i browseren — ingen netværksafhængighed midt i en optimering.
- Ufuldstændige svar: familier der ikke har svaret markeres tydeligt, og admin vælger eksplicit om de skal udelades eller medtages med konservative standardværdier.
- Ingen fejl sluges. Alt der fejler siger hvad der fejlede og hvad brugeren kan gøre.

## 14. Test

Solverne er rene funktioner uden sideeffekter og dermed direkte testbare.

**Uafhængig verifikator.** En funktion der får et løsningsforslag og brute-force-tjekker alle fem hårde krav uden at dele kode med solverne. Køres på hvert eneste solver-output i testene, og i produktion som sidste sikring før udgivelse er mulig.

**1000-simulationers testkørsel (påkrævet accepttest).** Generér 1000 syntetiske klasser à 24 børn med tilfældige, realistiske forældreprofiler — inklusive ondsindede fordelinger (kun to familier kan hente; alle kan kun torsdag; halvdelen kan ikke være vært). For hver simulation køres begge solvere. Krav:

| Metrik | Krav |
|---|---|
| Hårde krav brudt | **0** ud af alle producerede løsninger, begge solvere |
| Løsning eller forklaring | 100 % — hver kørsel ender enten i en gyldig løsning eller i en konkret, handlingsbar uløselighedsbesked. Aldrig noget derimellem |
| Determinisme | Samme seed → identisk output, begge solvere |
| Køretid A | median < 500 ms, 99. percentil < 2 s |
| Køretid B | median < 5 s ved 24 børn |
| A's kvalitet | A's score inden for 5 % af B's optimum i mindst 90 % af de kørsler hvor B finder en løsning |
| Byrdespredning | ingen familie tildeles flere værtsroller end sin egen angivne kapacitet, i nogen kørsel |

Kørslen udsender en rapport med fordelinger, ikke kun bestået/fejlet, så vægtene kan kalibreres på faktiske tal.

**Øvrig test:** enhedstests af scoring og constraints; property-based tests af rotationen; E2E på skemaets indsend- og opdater-flow; visuel regression på 320/768/1024/1440 px.

## 15. Åbne beslutninger overladt til implementeringsplanen

- Præcis afkøling og trækrepertoire i simulated annealing (kalibreres mod 1000-simulationskørslen).
- Om bekræftelsesmail sendes via Apps Script `MailApp` eller udelades i v1 til fordel for at admin selv videresender links.
- Konkret ordlyd i samtykketeksten.
