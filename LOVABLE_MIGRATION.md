# Siirtosuunnitelma: nykyinen laskuri → Lovable

Päivitetty 21.11.2026. Tämä dokumentti kuvaa **valmistelun**, ei jo tehtyä Lovable-siirtoa.

## 1. Lähtötilanne

Tämä GitHub-repositorio sisältää toimivan staattisen web-sovelluksen:

- `index.html` – käyttöliittymä, suomalaiset syötekentät ja tulosnäkymät
- `app.js` – korkolaskenta, tukikuukausimalli, opintolainahyvitys, sijoitusstrategiat, satunnaispolku ja herkkyysanalyysi
- `styles.css` – nykyiset tyylit

Tietokantaa, käyttäjätunnistusta tai API-avaimia ei ole. Kaikki laskelmat tehdään selaimessa. Chart.js haetaan CDN:stä. Säilytä alkuperäinen repo vertailukohtana.

## 2. Tuo projekti Lovableen

1. Avaa tämän repon GitHub-sivu.
2. Valitse **Code → Download ZIP**. ZIP sisältää alkuperäiset kolme ohjelmatiedostoa sekä dokumentit ja testit.
3. Avaa [Lovable](https://lovable.dev/) ja valitse **+ → Import project to Lovable → Upload ZIP**. Jos käyttöliittymän sanamuodot ovat muuttuneet, käytä Lovablen nykyistä projektin tuontitoimintoa.
4. Liitä alla oleva aloituskehote. Älä anna mallin arvata rahoituslaskelmia uudelleen, vaan säilytä alkuperäinen logiikka testattavana vertailukohtana.
5. Vertaa Lovablen luoman version tuloksia alkuperäiseen ennen julkaisua. Ota mahdollinen GitHub-synkronointi käyttöön uuden Lovable-projektin asetuksista vasta tuonnin jälkeen; älä korvaa tätä repo-sisältöä vahingossa.

Virallinen tuontiohje: https://lovable.dev/free-import

**Vaihtoehto:** ZIP voidaan valmistaa vain kolmesta ohjelmatiedostosta, jos Lovable käsittelee koko projektin tiedostovalikoiman huonosti. Näin testit ja dokumentaatio eivät häiritse importtia.

## 3. Aloituskehote Lovablelle

```text
Import the attached Finnish student-loan and investment calculator project.

GOAL
Rebuild this working static site as a polished, mobile-first React + TypeScript web application. Keep all calculator functionality and Finnish language. Do not treat this as an empty template or generate a new financial model.

SOURCE OF TRUTH
The uploaded index.html, app.js and styles.css are the existing implementation.
Preserve the calculations from app.js, including:
- the study-period support-month calendar and loan withdrawals;
- capitalized loan interest during studies;
- the estimated Finnish student-loan credit, degree cap and support-limit assumptions;
- the no-loan, Strategy A and Strategy B comparison;
- independent and comparison-based reinvestment modes;
- annuity loan repayments and released-payment reinvestment;
- deterministic development, a shared stochastic path, and return sensitivity analysis.

ARCHITECTURE
Separate pure financial model logic from React components (e.g. src/lib/calculator.ts).
Build typed input and result structures. Use reusable components for input groups, summaries, charts and result table.
Do not implement authentication, a database, payments, marketing automation or an AI assistant in the first version.
Do not add external API calls to calculate financial results.

UX
Keep user-facing copy in Finnish. Use a trustworthy, accessible, uncluttered financial-tool interface.
Make input fields and interactive charts responsive on 320px-wide phones and desktops.
Make assumptions and exclusions easy to find, and clearly label estimates as illustrative.
Users should be able to compare scenarios and understand why the outputs change.

VALIDATION
Preserve input constraints and useful Finnish error messages.
Never display NaN, Infinity or fake certainty. Keep all results deterministic for the deterministic scenario.
Port the core invariants in tests/model.test.cjs into the new project's test framework.

BASELINE REGRESSION EXAMPLE (existing model, not independently verified legal or financial advice)
For the original default inputs:
- 5 years of studies, 9 support months/year, 850 EUR loan draw per support month;
- 300 EUR invested from loan per support month;
- 3% loan rate, 8% effective yearly investment return;
- 10-year Strategy A, 20-year Strategy B, 20-year horizon after graduation;
- 300 E monthly investment after graduation, 300 E degree credit principal cap 18,000 EUR;
Expected according to the ORIGINAL model:
- total drawn principal 38,250 EUR;
- estimated loan credit 6,200 EUR;
- repayment principal after modelled accrued interest and credit about 35,269.66 EUR;
- initial annuity payment A about 340.57 EUR/month and B about 195.60 EUR/month.
Use these values as regression tests, not as proof that legal assumptions are current.

Before publishing, show a clear checklist of preserved features, changed assumptions (if any), and remaining issues.
```

## 4. Tarkistuslista ennen julkaisemista

- [ ] Kaikki alkuperäisen laskurin syötteet, strategiat ja kuvaajat toimivat.
- [ ] Oletuslaskelman arvot vastaavat alkuperäistä laskentamallia (yllä).
- [ ] Nollakorko, 0 euron nostot, lyhyt tarkastelujakso, -100 % tuotto ja virheelliset syötteet käsitellään.
- [ ] Strategioiden vertailun kassavirtaoletukset kerrotaan selkeästi.
- [ ] Opintotukikuukausien ja hyvityksen sääntöpohja tarkistettu Kelan ajantasaisista lähteistä; mallin mahdolliset puutteet dokumentoitu.
- [ ] Laskelman ilmoittamat korot, kulut, verot ja inflaatio eivät anna virheellistä mielikuvaa kattavuudesta.
- [ ] Mobiilikäytettävyys, kontrastit, näppäimistökäyttö ja virheilmoitukset testattu.
- [ ] Sivu sisältää asianmukaisen vastuuvapauslausekkeen eikä esitä henkilökohtaisia sijoitussuosituksia.
- [ ] Uusi versio tarkistettu ennen kuin vanha osoite tai GitHub-päähaara vaihdetaan.

## 5. Jatkoehdotukset (ei osa ensimmäistä siirtoa)

1. Parempi strategioiden vertailu samalla kuukausibudjetilla.
2. Lainakorkojen ja markkinatuottojen skenaariovalinnat sekä Monte Carlo -jakaumat yhden polun sijaan.
3. Skenaarioiden tallennus käyttäjän omalle laitteelle.
4. Mahdollinen PWA-tuki.
5. Pankkiehtojen ja Kelan sääntöjen päivitysprosessi erillisenä luotettavana tietolähdekerroksena.
