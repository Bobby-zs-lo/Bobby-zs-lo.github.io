# Sådan sætter du legegruppe-backenden op

Legegruppe-appen er en almindelig statisk side på GitHub Pages. Den kan ikke selv gemme
noget, så svarene fra forældrene ligger i **dit eget Google Sheet**, og et lille
Apps Script står imellem. Samme opskrift som kvitterings-appen — se `Apps-Script-Setup.md`
i roden hvis du vil sammenligne.

Sæt en halv time af første gang. Bagefter rører du det ikke igen.

---

## Trin 1 — Opret regnearket

1. Gå til Google Sheets og opret et nyt tomt regneark. Kald det **Legegruppe**.
2. Kopiér regnearkets ID ud af adresselinjen. I
   `https://docs.google.com/spreadsheets/d/`**`1ABCdef123-XYZ`**`/edit`
   er den fede del dit ID.

Du skal ikke oprette faner eller overskrifter. Scriptet gør det selv første gang det kører.

---

## Trin 2 — Opret Apps Script-projektet

1. Gå til [script.google.com](https://script.google.com/) → **Nyt projekt**.
2. Kald projektet "Legegruppe backend".
3. Slet det tomme `Code.gs`-indhold, og indsæt hele indholdet af
   `legegruppe/apps-script/Code.gs` fra dette repo.
4. Ret de tre linjer øverst:

```javascript
const SPREADSHEET_ID = "dit-regneark-id-her";
const ADMIN_PASSPHRASE = "en-lang-sætning-kun-du-kender";
const CLASS_ID = "klasse-2b";
```

**Om adgangskoden:** vælg en hel sætning, ikke et ord. Den er det eneste der står mellem
internettet og alle klassens svar. Den bliver aldrig gemt i dette repo — kun her i
Apps Script-projektet.

---

## Trin 3 — Udgiv som web-app

1. Klik **Udrul** → **Ny udrulning**.
2. Vælg type **Web-app**.
3. Sæt:
   - **Kør som:** Mig
   - **Hvem har adgang:** Alle
4. Klik **Udrul**. Google beder om lov til at tilgå dine regneark — det skal du give.
5. Kopiér den URL du får. Den slutter på `/exec`.

"Alle har adgang" lyder voldsomt, men det er nødvendigt: forældrene skal kunne skrive
uden en Google-konto. Adgangen er styret af de personlige links og af adgangskoden,
ikke af Googles login.

---

## Trin 4 — Fortæl siden hvor backenden er

Åbn `legegruppe/js/api.js` og sæt din `/exec`-URL ind:

```javascript
const ENDPOINT = 'https://script.google.com/macros/s/DIN-UDRULNING/exec';
```

URL'en må gerne stå i repoet. Den er en adresse, ikke en hemmelighed — uden
adgangskoden eller et gyldigt forældre-link kan man ikke få noget ud af den.

---

## Trin 5 — Tjek at det virker

Kør de to kommandoer herunder i en terminal. De er den hurtigste måde at se om
udrulningen er i orden, før du inddrager nogen forældre.

**Med adgangskode — skal virke:**

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"action":"adminSnapshot","passphrase":"din-adgangskode"}' \
  "https://script.google.com/macros/s/DIN-UDRULNING/exec"
```

Forventet svar:

```json
{"ok":true,"classId":"klasse-2b","families":[],"children":[],"blockedPairs":[],"history":[],"rounds":[]}
```

Kig samtidig i regnearket: de fem faner (`families`, `children`, `rounds`,
`pairs_history`, `blocked_pairs`) skal nu være oprettet med overskrifter.

**Uden adgangskode — skal afvises:**

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"action":"adminSnapshot"}' \
  "https://script.google.com/macros/s/DIN-UDRULNING/exec"
```

Forventet svar:

```json
{"ok":false,"error":"Ikke autoriseret."}
```

Får du `ok:true` på den anden kommando, er noget galt. Stop, og tjek at
`ADMIN_PASSPHRASE` faktisk er sat, og at du har udrullet den nyeste version.

---

## Trin 6 — Opret familierne

Gå til `https://bobbylo.dk/legegruppe/admin/`, indtast adgangskoden, og opret én familie
ad gangen med forælderens navn og barnets navn.

For hver familie får du et **personligt link** i stil med:

```
https://bobbylo.dk/legegruppe/?f=k7m2xq9p4b1v8n3c5d0a
```

Send det til den familie — og kun den familie. Linket er både deres login og deres
redigeringsnøgle. Det er også det link de bruger til at rette deres svar senere,
så skriv i beskeden at de skal gemme det.

Praktisk i Aula: send det som en **individuel** besked, ikke i klassetråden. Et link i
en fælles tråd er et link alle kan bruge.

---

## Hvis adgangskoden slipper ud

1. Åbn Apps Script-projektet og ret `ADMIN_PASSPHRASE` til en ny.
2. **Udrul** → **Administrer udrulninger** → rediger den eksisterende → **Ny version** → **Udrul**.
   Bruger du "Ny udrulning" i stedet, får du en ny URL og skal også opdatere `api.js`.
3. Den gamle adgangskode virker ikke længere i samme øjeblik den nye version er ude.

Forældrenes links er upåvirkede. Skal ét enkelt link spærres, skifter du bare den
families `token` i regnearket og sender dem et nyt.

---

## Ved skoleårets slutning

Når legegrupperne er slut, skal svarene ikke blive liggende. Det er oplysninger om
børn, og de har ingen grund til at eksistere længere end formålet.

I admin-siden nederst er der en slet-knap. Den kræver at du skriver `SLET ALT` for at
virke, og den tømmer alle fem faner. Selve regnearket bliver stående, tomt.

Vil du beholde historikken til næste år — så børnene ikke havner i de samme grupper
igen — så slet i stedet kun `families` og `children` og lad `pairs_history` stå. Den
indeholder kun barne-ID'er, ingen kontaktoplysninger.

---

## Hvad der ligger i regnearket

| Fane | Indhold | Hvem kan se det |
|---|---|---|
| `families` | Forældrenavn, kontakt, kapacitet, ugedage, ferieuger, note | Familien selv (egen række), admin (alle) |
| `children` | Barnets fornavn og hvilken familie det hører til | Alle med et gyldigt link |
| `rounds` | De udgivne planer | Alle med et gyldigt link |
| `pairs_history` | Hvilke børn har været i gruppe sammen | Kun admin |
| `blocked_pairs` | Børn der ikke må være i samme gruppe | **Kun admin. Vises aldrig nogen steder.** |

Der gemmes ingen adresser, ingen CPR-numre, ingen fødselsdatoer og ingen billeder.

Kontaktoplysninger deles først når en runde er udgivet, og kun med de familier man
faktisk er sat sammen med. Resten af klassen ses ved navn, men uden kontaktinfo.
