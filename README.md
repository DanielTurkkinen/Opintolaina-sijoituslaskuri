# Opintolaina- ja sijoituslaskuri

Suomenkielinen selainpohjainen laskuri opintolainan nostojen, sijoittamisen ja takaisinmaksustrategioiden vertailuun.

> **Huom.** Laskuri on havainnollistava suunnittelutyökalu, ei henkilökohtainen sijoitus- tai lainaneuvo. Tarkista ajantasaiset opintotukeen ja opintolainahyvitykseen liittyvät ehdot [Kelasta](https://www.kela.fi/opintolainahyvitys) ja oman pankkisi lainaehdoista ennen taloudellisia päätöksiä.

## Nykyinen toteutus

Projektissa on kolme alkuperäistä tiedostoa:

- `index.html` – suomenkielinen käyttöliittymä, laskurin syötteet, tulokset ja kuvaajat
- `styles.css` – responsiivinen ulkoasu
- `app.js` – laskentamalli, strategiat, simuloinnit ja kuvaajien päivitys

Laskuri toimii selaimessa ilman palvelinta tai käyttäjätunnuksia. Kuvaajat käyttävät CDN:stä ladattavaa Chart.js-kirjastoa. Internet-yhteys tarvitaan kuvaajien kirjaston lataamiseen.

### Nykyiset ominaisuudet

- Opintojen tukikuukausien ja lainan nostojen mallinnus
- Lainasta sijoitettava osuus sekä opiskeluaikainen korkojen kertyminen
- Opintolainahyvityksen arvio tutkinnon ja nostojen perusteella
- Ei lainaa / strategia A / strategia B -vertailu
- Kiinteän annuiteetin takaisinmaksumallit ja mahdollisuus sijoittaa vapautuvia kuukausieriä
- Nettovarallisuuden, lainapääoman ja sijoitussalkun kuvaajat
- Yhden satunnaisen tuottopolun volatiliteettisimulaatio
- Tuotto-oletuksen herkkyysanalyysi

Laskurin oleelliset oletukset ja rajaukset löytyvät myös käyttöliittymästä. Malli ei esimerkiksi huomioi verotusta, inflaatiota, pankkikuluja tai hyvityksen todellista maksuaikataulua.

## Käynnistys

Avaa `index.html` selaimessa. Vaihtoehtoisesti käynnistä paikallinen staattinen palvelin projektin juurihakemistossa:

```bash
python -m http.server 8000
```

Avaa sitten `http://localhost:8000`.

## Testit

Vaatii Node.js 20+:n; tuotantosovelluksessa ei tällä hetkellä ole Node-riippuvuuksia.

```bash
node --test tests/model.test.cjs
```

Testit varmistavat laskentamallin tärkeimpiä invariansseja. Ne eivät yksin vahvista Kelan ehtojen tai pankin korkolaskennan ajantasaisuutta.

## Siirto Lovableen

**Katso [LOVABLE_MIGRATION.md](LOVABLE_MIGRATION.md).** Siellä on siirtoprosessi, valmis aloituskehote, vaatimukset ja tarkistuslista. Alkuperäisiä `index.html`, `app.js` ja `styles.css` -tiedostoja ei tarvitse korvata ennen kuin uusi versio on testattu.

### Lähtökohta

Ensimmäisessä Lovable-versiossa kannattaa priorisoida ulkoasun ja käyttökokemuksen uudistus **muuttamatta laskentamallin semantiikkaa**. Sen jälkeen mallia voidaan tarkistaa lähteitä ja regressiotestejä vasten sekä lisätä toimintoja hallitusti.
