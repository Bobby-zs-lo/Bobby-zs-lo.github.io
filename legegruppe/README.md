# Legegruppe

Danner legegrupper i en skoleklasse ud fra hvad forældrene faktisk kan overkomme —
og lægger en værtsplan ud på ugenumre.

Ligger på `https://bobbylo.dk/legegruppe/`. Ikke indekseret, ikke linket fra
`apps.html`. Man skal have et link for at komme ind.

## Problemet den løser

En legegruppe er 4–5 børn der mødes 1–2 gange om måneden, uafhængigt af venskaber,
og som blandes på ny hver 3.–6. måned. Det svære er ikke børnene, det er forældrene:
nogle har masser af overskud, nogle kan kun tirsdage, nogle kan godt have fire børn
hjemme men ikke hente dem fra skole, og nogle er alene med flere børn og kan ikke
være vært.

Almindelige skemaer spørger "hvor meget overskud har du?" og mister præcis den
information der skal bruges. Her er hvert spørgsmål én akse, og de holdes adskilt
hele vejen ned i algoritmen.

**Forældrenes vilkår vejer tungest.** Et barn placeres hellere i en mindre spændende
gruppe end i en gruppe hvor ingen kan hente det.

## De tre sider

| Side | Hvem | Hvad |
|---|---|---|
| `/legegruppe/?f=TOKEN` | Forældre | Spørgeskemaet, og "ret mine svar" bagefter |
| `/legegruppe/plan/?f=TOKEN` | Forældre | Egen gruppe, egne værtsuger, kontakter, print |
| `/legegruppe/admin/` | Kun ejeren | Kør runde, juster i hånden, udgiv |

Forældre har ingen konto. Deres personlige link er både login og redigeringsnøgle.

## De to løsere

Valget rammer kun gruppedannelsen — værtsplanen er fælles kode bagefter.

**A — heuristik (standard).** Bygger en gyldig løsning og forbedrer den med
simulated annealing. Cirka 200 ms. Stopper på et fast antal skridt, ikke på uret,
så samme input altid giver samme svar.

**B — eksakt.** Opregner alle lovlige grupper og finder beviseligt den billigste
opdeling, via branch-and-bound med et startgæt fra A. Cirka 4 sekunder for 24 børn,
men en svær klasse kan tage 15–20. Løber den tør for tid, siger den det — den
påstår aldrig at have bevist noget den ikke har.

Vælg A til daglig. Vælg B når du vil vide om A overså noget. "Kør begge" viser
forskellen, og som regel er den lille.

**B er kun optimal for de vægte du har sat.** Det er ikke et objektivt facit.

**B kommer ikke altid i mål.** Målt over 1000 simulerede klasser beviser den
optimalitet for omkring halvdelen af de 24-børns klasser der beviseligt kan løses,
inden for 15 sekunder. Mere tid hjælper ikke nævneværdigt: af otte klasser der løb
tør ved 15 sekunder, nåede kun én i mål ved 60. Søgerummet vokser eksponentielt, så
det er en algoritmisk mur og ikke en indstilling.

Det er til at leve med, fordi B er en "bevis det"-knap og ikke hverdagsværktøjet:
A lå inden for 5 % af B's beviste optimum i **100 %** af de kørsler hvor begge nåede
frem. Når B ikke kan bevise noget, siger den det — den gætter ikke.

## Hvad der aldrig sker

- Et forbudt par ender aldrig i samme gruppe, og appen foreslår aldrig at lempe det.
- En familie sættes aldrig på som vært flere gange end den selv har sagt.
- En plan der bryder et hårdt krav kan ikke udgives — en uafhængig kontrol står
  imellem, og den deler ikke kode med løserne.
- En gruppe uden vært dannes aldrig. Uden henter er derimod tilladt — det aftales.
- Ingen rangliste over hvem der bidrager mest. Byrden fordeles, den måles ikke.

## Test

```bash
bash legegruppe/tests/run-all.sh          # alle enhedstests + en hurtig røgprøve
bash legegruppe/tests/run-all.sh --full   # + 1000 simulationer (20–40 minutter)
```

Ingen npm, ingen testramme — hver fil er `node legegruppe/tests/x.test.mjs`.

Accepttesten kører 1000 syntetiske klasser à 24 børn gennem begge løsere og kræver:
nul brud på hårde krav, nul kørsler der hverken løser eller forklarer sig, nul
tilfælde af at samme input gav forskellige svar, og at A ligger inden for 5 % af
B's bevist optimale i mindst 90 % af de sammenlignelige kørsler.

Den fandt allerede én ægte fejl: optimeringen stoppede oprindeligt på uret, så en
travl maskine gav et andet resultat. Det er nemlig pointen med at køre 1000.

## Backend

Google Apps Script → et privat Google Sheet. Se `SETUP.md`. Kildekoden ligger i
`apps-script/Code.gs` for at være versionsstyret; den indsættes manuelt i Googles
editor.

Adgangskoden står **kun** i Apps Script-projektet, aldrig i dette repo.

## Data

Gemmes: barnets fornavn, forælderens fornavn, én kontaktoplysning, kapacitetssvar,
ugedage, ferieuger, fritekstnote, samtykketidspunkt.

Gemmes ikke: adresser, CPR, fødselsdatoer, billeder.

Kontaktoplysninger deles først når en runde er udgivet, og kun med de familier man
er sat sammen med. Resten af klassen ses ved navn, uden kontaktinfo.

Forbudte par ligger i en fane kun ejeren kan læse og fremgår aldrig af nogen
udgivet plan.

**Sletning ved skoleårets slutning:** admin-siden nederst, skriv `SLET ALT`. Vil du
beholde historikken så børnene ikke havner sammen igen næste år, så slet i stedet
kun `families` og `children` i regnearket og lad `pairs_history` stå — den
indeholder kun barne-ID'er.

## Værtskab er kravet, transport er en aftale

Det eneste gruppen *skal* kunne, er at blive afholdt: mindst én familie skal kunne
lægge hus til eller tage gruppen med ud, og der skal findes en hverdag alle kan.

Hentning fra skole er derimod ikke et krav. Kan ingen i gruppen hente, bliver mødet
alligevel lagt i planen, bare med **"transport aftales indbyrdes, eller børnene
mødes på skolens legeplads"**. Det var oprindeligt et hårdt krav, og det afviste
grupper der i praksis ville have fungeret fint — forældre løser den slags selv.

Algoritmen foretrækker stadig grupper der kan klare deres egen hentning; det er
bare en præference nu, ikke et veto.

## Skalering til flere klasser

Alt data bærer allerede `class_id`, og alle backend-kald tager en klasse. At åbne
for flere klasser kræver kun ny adgangskontrol — ikke en ny datamodel og ikke en ny
algoritme.
