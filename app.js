const COLORS = {
  green: "#35f28f",
  green2: "#10b981",
  green3: "#86efac",
  red: "#ff4d4d",
  red2: "#fb7185",
  neutral: "#94a3b8",
  yellow: "#facc15"
};

let mainChart = null;
let stochasticChart = null;
let sensitivityChart = null;

if (typeof Chart !== "undefined") {
Chart.defaults.color = "#9fb4a8";
Chart.defaults.borderColor = "rgba(148, 163, 184, 0.16)";
Chart.defaults.font.family = 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';

}

function euro(value, decimals = 0) {
  if (!Number.isFinite(value)) return "–";
  return new Intl.NumberFormat("fi-FI", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

function percentLabel(value) {
  return new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 1 }).format(value) + " %";
}

const INPUT_LIMITS = {
  studyYears: [0, 15], supportMonths: [0, 12], loanPerMonth: [0, 850],
  investFromLoan: [0, 850], postStudyInvest: [0, 100000],
  investmentReturn: [-100, 100], loanRate: [0, 30], termA: [1, 50],
  termB: [1, 50], horizonYears: [0, 60], volatility: [0, 100],
  sensitivityMin: [-100, 100], sensitivityMax: [-100, 100], usedSupportMonths: [0, 64]
};
const INTEGER_INPUTS = new Set(["supportMonths", "termA", "termB", "usedSupportMonths"]);
function readNumber(id) {
  const element = document.getElementById(id);
  const raw = element.value.trim();
  const value = Number(raw);
  const [min, max] = INPUT_LIMITS[id] || [-Infinity, Infinity];
  if (!raw || !Number.isFinite(value) || value < min || value > max ||
      (INTEGER_INPUTS.has(id) && !Number.isInteger(value))) {
    element.setAttribute("aria-invalid", "true");
    throw new Error("Tarkista kenttä: " + (element.closest?.("label")?.childNodes[0]?.textContent.trim() || id) +
      ". Sallittu väli " + min + "–" + max + (INTEGER_INPUTS.has(id) ? ", kokonaisluku." : "."));
  }
  element.setAttribute("aria-invalid", "false");
  return value;
}

function monthlyReturn(annualReturn) {
  return Math.expm1(Math.log1p(annualReturn) / 12);
}

function getInputs(overrideReturn = null) {
  return {
    studyYears: Math.max(0, readNumber("studyYears")),
    supportMonths: readNumber("supportMonths"),
    loanPerMonth: Math.max(0, readNumber("loanPerMonth")),
    investFromLoan: Math.max(0, readNumber("investFromLoan")),
    postStudyInvest: Math.max(0, readNumber("postStudyInvest")),
    annualReturn: overrideReturn === null ? readNumber("investmentReturn") / 100 : overrideReturn,
    loanMonthlyRate: readNumber("loanRate") / 100 / 12,
    termA: Math.max(1, Math.round(readNumber("termA"))),
    termB: Math.max(1, Math.round(readNumber("termB"))),
    horizonMonths: Math.round(readNumber("horizonYears") * 12),
    degreeLoanCap: Number(document.getElementById("degreeLoanCap").value),
    studyStartPeriod: document.getElementById("studyStartPeriod").value,
    usedSupportMonths: readNumber("usedSupportMonths"),
    useCredit: document.getElementById("useCredit").checked,
    reinvestFreedPayments: document.getElementById("reinvestFreedPayments").checked,
    strategyMode: document.getElementById("strategyMode").value,
    volatility: Math.max(0, readNumber("volatility") / 100)
  };
}

function monthlyPayment(principal, monthlyRate, months) {
  if (principal <= 0 || months <= 0) return 0;
  if (monthlyRate === 0) return principal / months;

  return principal * monthlyRate / -Math.expm1(-months * Math.log1p(monthlyRate));
}

function remainingBalance(principal, monthlyRate, payment, month, totalMonths = null) {
  if (principal <= 0) return 0;
  if (month <= 0) return principal;
  if (monthlyRate === 0) return Math.max(0, principal - payment * month);
  if (totalMonths !== null) {
    return payment * -Math.expm1(-Math.max(0, totalMonths - month) * Math.log1p(monthlyRate)) / monthlyRate;
  }

  const balance = principal * Math.pow(1 + monthlyRate, month) -
    payment * (Math.expm1(month * Math.log1p(monthlyRate)) / monthlyRate);

  return Math.max(0, balance);
}

function gaussianRandom() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function constantReturns(months, monthlyReturn) {
  return Array.from({ length: months }, () => monthlyReturn);
}

function randomReturns(months, annualMean, annualVolatility) {
  if (annualVolatility === 0 || annualMean === -1) return constantReturns(months, monthlyReturn(annualMean));
  const sigma = annualVolatility / Math.sqrt(12);
  const mu = Math.log1p(annualMean) / 12 - sigma * sigma / 2;
  return Array.from({ length: months }, () => Math.expm1(mu + sigma * gaussianRandom()));
}

/* -----------------------------
   PHASE 1: study period helpers
----------------------------- */

function getSupportLimit(inputs) {
  // The degree's statutory credit principal cap encodes its target support months.
  const degreeCaps = [10800, 12800, 14400, 16400, 18000, 20000, 21600];
  const additions = { since2017: 3, since2014: 5, since2011: 10 };
  if (!degreeCaps.includes(inputs.degreeLoanCap) || !Object.hasOwn(additions, inputs.studyStartPeriod)) {
    throw new Error("Valitse tuettu tutkinto ja ensimmäisten korkeakouluopintojen aloitusajankohta.");
  }
  const maximum = inputs.degreeLoanCap / 400 + additions[inputs.studyStartPeriod];
  const used = inputs.usedSupportMonths;
  if (!Number.isInteger(used) || used < 0 || used > maximum) {
    throw new Error("Aiemmin käytettyjä tukikuukausia voi olla tässä tutkintolaskelmassa 0–" + maximum + ".");
  }
  return { maximum, remaining: maximum - used };
}

function getStudyCalendar(studyYears, supportMonthsPerYear, supportLimit = Infinity) {
  const totalCalendarMonths = Math.round(studyYears * 12);
  const fullYears = Math.floor(totalCalendarMonths / 12);
  const extraMonths = totalCalendarMonths % 12;
  const requestedSupportMonths = fullYears * supportMonthsPerYear + Math.min(extraMonths, supportMonthsPerYear);
  const supportMonthsTotal = Math.min(requestedSupportMonths, supportLimit);

  return {
    totalCalendarMonths,
    supportMonthsTotal,
    requestedSupportMonths
  };
}

function isSupportMonth(monthIndexOneBased, supportMonthsPerYear, supportMonthsUsed, supportMonthsTotal) {
  const monthInYear = ((monthIndexOneBased - 1) % 12) + 1;
  return monthInYear <= supportMonthsPerYear && supportMonthsUsed < supportMonthsTotal;
}

function simulateStudyPeriod(inputs, monthlyReturns, useStudentLoan) {
  const calendar = getStudyCalendar(inputs.studyYears, inputs.supportMonths, getSupportLimit(inputs).remaining);

  let loanBalance = 0;
  let portfolio = 0;
  let investedPrincipal = 0;
  let livingCostsFromLoan = 0;
  let supportMonthsUsed = 0;

  for (let month = 1; month <= calendar.totalCalendarMonths; month++) {
    const supportMonth = isSupportMonth(
      month,
      inputs.supportMonths,
      supportMonthsUsed,
      calendar.supportMonthsTotal
    );

    if (supportMonth) {
      supportMonthsUsed += 1;

      if (useStudentLoan) {
        const loanDraw = inputs.loanPerMonth;
        const invested = Math.min(inputs.investFromLoan, loanDraw);

        loanBalance += loanDraw;
        portfolio += invested;
        investedPrincipal += invested;
        livingCostsFromLoan += loanDraw - invested;
      }
    }

    loanBalance *= 1 + inputs.loanMonthlyRate;
    portfolio *= 1 + monthlyReturns[month - 1];
  }

  return {
    portfolio,
    loanBalance,
    supportMonthCount: supportMonthsUsed,
    totalLoanDrawn: useStudentLoan ? supportMonthsUsed * inputs.loanPerMonth : 0,
    capitalizedInterest: useStudentLoan ? loanBalance - supportMonthsUsed * inputs.loanPerMonth : 0,
    investedPrincipal,
    livingCostsFromLoan
  };
}

/* -----------------------------
   PHASE 2: graduation snapshot
----------------------------- */

function calculateStudentLoanCredit(supportMonthCount, loanPerMonth, useCredit, degreeLoanCap = 18000) {
  if (!useCredit) {
    return { eligibleLoan: 0, credit: 0 };
  }

  const eligibleLoan = Math.min(supportMonthCount * loanPerMonth, degreeLoanCap);
  const credit = Math.max(0, (eligibleLoan - 2500) * 0.40);

  return { eligibleLoan, credit };
}

function createGraduationSnapshot(inputs, studyReturns) {
  const withLoan = simulateStudyPeriod(inputs, studyReturns, true);
  const noLoan = simulateStudyPeriod(inputs, studyReturns, false);
  const creditInfo = calculateStudentLoanCredit(
    withLoan.supportMonthCount,
    inputs.loanPerMonth,
    inputs.useCredit,
    inputs.degreeLoanCap
  );

  return {
    withLoan,
    noLoan,
    creditInfo,
    repaymentLoan: Math.max(0, withLoan.loanBalance - creditInfo.credit)
  };
}

/* -----------------------------
   PHASE 3: repayment period
----------------------------- */

function buildRepaymentPlan(startingLoan, loanMonthlyRate, termYears) {
  const months = termYears * 12;
  const payment = monthlyPayment(startingLoan, loanMonthlyRate, months);

  return {
    termYears,
    months,
    payment,
    totalPaid: payment * months,
    interestPaid: payment * months - startingLoan
  };
}

function simulateRepaymentPath({
  startingPortfolio,
  startingLoan,
  credit,
  plan,
  loanMonthlyRate,
  monthlyReturns,
  baseMonthlyInvestment,
  extraInvestmentForMonth
}) {
  let portfolio = startingPortfolio;

  const wealth = [];
  const balances = [];
  const portfolios = [];
  const addedInvestments = [];

  for (let month = 0; month <= monthlyReturns.length; month++) {
    const balance = month < plan.months
      ? remainingBalance(startingLoan, loanMonthlyRate, plan.payment, month, plan.months)
      : 0;

    portfolios.push(portfolio);
    balances.push(balance);
    wealth.push(portfolio - balance);

    if (month < monthlyReturns.length) {
      portfolio *= 1 + monthlyReturns[month];

      const extra = extraInvestmentForMonth(month + 1, plan.payment);
      const monthlyInvestment = baseMonthlyInvestment + extra;

      portfolio += monthlyInvestment;
      addedInvestments.push(monthlyInvestment);
    }
  }

  return {
    payment: plan.payment,
    totalPaid: plan.totalPaid,
    interestPaid: plan.interestPaid,
    finalPortfolio: portfolio,
    finalBalance: balances[balances.length - 1],
    finalNetWorth: wealth[wealth.length - 1],
    wealth,
    balances,
    portfolios,
    addedInvestments
  };
}

function createExtraInvestmentRules(inputs, planA, planB) {
  if (!inputs.reinvestFreedPayments) {
    return {
      extraA: () => 0,
      extraB: () => 0,
      paymentDifference: 0,
      modeDescription: "Lyhennyksistä vapautuvaa rahaa ei sijoiteta."
    };
  }

  if (inputs.strategyMode === "comparison") {
    const largerPayment = Math.max(planA.payment, planB.payment);
    const smallerPayment = Math.min(planA.payment, planB.payment);
    const paymentDifference = Math.max(0, largerPayment - smallerPayment);
    function comparisonRule(plan) {
      return month => largerPayment - (month <= plan.months ? plan.payment : 0);
    }

    return {
      extraA: comparisonRule(planA),
      extraB: comparisonRule(planB),
      paymentDifference,
      modeDescription: "Vertailuperusteinen: pienemmän kuukausierän strategia sijoittaa kuukausierien erotuksen."
    };
  }

  function independentRule(plan) {
    return (month, currentPayment) => {
      if (month > plan.months) {
        return currentPayment;
      }
      return 0;
    };
  }

  return {
    extraA: independentRule(planA),
    extraB: independentRule(planB),
    paymentDifference: 0,
    modeDescription: "Riippumaton: strategiat eivät käytä toistensa kuukausieriä lisäsijoituksen laskentaan."
  };
}

function simulateNoLoanPath(startingPortfolio, monthlyReturns, baseMonthlyInvestment) {
  const pseudoPlan = {
    termYears: 0,
    months: 0,
    payment: 0,
    totalPaid: 0,
    interestPaid: 0
  };

  return simulateRepaymentPath({
    startingPortfolio,
    startingLoan: 0,
    credit: 0,
    plan: pseudoPlan,
    loanMonthlyRate: 0,
    monthlyReturns,
    baseMonthlyInvestment,
    extraInvestmentForMonth: () => 0
  });
}

/* -----------------------------
   PHASE 4: full model
----------------------------- */

function runModel({ random = false, overrideReturn = null } = {}) {
  const inputs = getInputs(overrideReturn);
  const calendar = getStudyCalendar(inputs.studyYears, inputs.supportMonths, getSupportLimit(inputs).remaining);

  const studyReturns = random
    ? randomReturns(calendar.totalCalendarMonths, inputs.annualReturn, inputs.volatility)
    : constantReturns(calendar.totalCalendarMonths, monthlyReturn(inputs.annualReturn));

  const repaymentReturns = random
    ? randomReturns(inputs.horizonMonths, inputs.annualReturn, inputs.volatility)
    : constantReturns(inputs.horizonMonths, monthlyReturn(inputs.annualReturn));

  const snapshot = createGraduationSnapshot(inputs, studyReturns);

  const planA = buildRepaymentPlan(snapshot.repaymentLoan, inputs.loanMonthlyRate, inputs.termA);
  const planB = buildRepaymentPlan(snapshot.repaymentLoan, inputs.loanMonthlyRate, inputs.termB);

  const extraRules = createExtraInvestmentRules(inputs, planA, planB);

  const strategyA = simulateRepaymentPath({
    startingPortfolio: snapshot.withLoan.portfolio,
    startingLoan: snapshot.repaymentLoan,
    credit: 0,
    plan: planA,
    loanMonthlyRate: inputs.loanMonthlyRate,
    monthlyReturns: repaymentReturns,
    baseMonthlyInvestment: inputs.postStudyInvest,
    extraInvestmentForMonth: extraRules.extraA
  });

  const strategyB = simulateRepaymentPath({
    startingPortfolio: snapshot.withLoan.portfolio,
    startingLoan: snapshot.repaymentLoan,
    credit: 0,
    plan: planB,
    loanMonthlyRate: inputs.loanMonthlyRate,
    monthlyReturns: repaymentReturns,
    baseMonthlyInvestment: inputs.postStudyInvest,
    extraInvestmentForMonth: extraRules.extraB
  });

  const noLoan = simulateNoLoanPath(
    snapshot.noLoan.portfolio,
    repaymentReturns,
    inputs.postStudyInvest
  );

  return {
    inputs,
    calendar,
    snapshot,
    planA,
    planB,
    strategyA,
    strategyB,
    noLoan,
    extraRules,
    paymentDifference: extraRules.paymentDifference,
    horizonMonths: inputs.horizonMonths
  };
}

/* -----------------------------
   UI helpers
----------------------------- */

function labelsFor(months) {
  const labels = [];
  for (let month = 0; month <= months; month++) labels.push((month / 12).toFixed(1));
  return labels;
}

function bestOf(result) {
  const ranking = [
    { name: "Ei opintolainaa", value: result.noLoan.finalNetWorth },
    { name: "Strategia A", value: result.strategyA.finalNetWorth },
    { name: "Strategia B", value: result.strategyB.finalNetWorth }
  ].sort((a, b) => b.value - a.value);
  const tied = ranking.filter(item => Math.abs(item.value - ranking[0].value) < 0.005);
  return { name: tied.map(item => item.name).join(" / "), value: ranking[0].value };
}

function setWarning() {
  const inputs = getInputs();
  const warnings = [];
  const supportLimit = getSupportLimit(inputs);
  const calendar = getStudyCalendar(inputs.studyYears, inputs.supportMonths, supportLimit.remaining);
  document.getElementById("supportLimitInfo").textContent =
    "Tutkinnon enimmäistukiaika: " + supportLimit.maximum + " kk. Tässä laskelmassa käytettävissä: " +
    supportLimit.remaining + " kk. Laskentaan sisältyy: " + calendar.supportMonthsTotal + " tukikuukautta.";
  if (calendar.requestedSupportMonths > calendar.supportMonthsTotal) {
    warnings.push("Valittu opiskeluaika ja vuosittaiset tukikuukaudet tarkoittaisivat " + calendar.requestedSupportMonths +
      " tukikuukautta. Laskenta rajattiin " + calendar.supportMonthsTotal +
      " tukikuukauteen: sen jälkeen lainaa ei enää nosteta eikä lainasta tehdä uusia sijoituksia. Opiskeluaika ja jo kertyneen salkun sekä lainan korkolaskenta jatkuvat.");
  }
  if (inputs.annualReturn * 100 < readNumber("sensitivityMin") || inputs.annualReturn * 100 > readNumber("sensitivityMax")) {
    warnings.push("Nykyinen tuotto-oletus on herkkyysanalyysin alueen ulkopuolella: sen pystylinja ei näy kuvaajassa.");
  }
  if (typeof Chart === "undefined") warnings.push("Kuvaajakirjasto ei latautunut. Luvut ja taulukot toimivat; kuvaajat tarvitsevat internetyhteyden.");

  if (inputs.investFromLoan > inputs.loanPerMonth) {
    warnings.push("Lainasta sijoitettava summa on suurempi kuin kuukausinosto. Laskuri käyttää sijoitukseen enintään nostetun lainamäärän.");
  }

  if (inputs.termA === inputs.termB) {
    warnings.push("Strategia A ja B käyttävät samaa takaisinmaksuaikaa, joten tulokset ovat samat.");
  }

  if (!inputs.reinvestFreedPayments) {
    warnings.push("Lyhennyksistä vapautuvan rahan sijoittaminen on pois päältä. Tällöin salkun loppuarvo ei sisällä lainan päättymisen jälkeistä lisäsijoittamista eikä vertailuperusteista kuukausierien erotusta.");
  }

  if (inputs.strategyMode === "comparison") {
    warnings.push("Vertailuperusteisessa mallissa strategian tulos voi riippua toisen strategian takaisinmaksuajasta, koska kuukausierien erotus sijoitetaan.");
  }

  const warning = document.getElementById("warning");

  if (warnings.length > 0) {
    warning.style.display = "block";
    warning.innerHTML = warnings.join("<br>");
  } else {
    warning.style.display = "none";
    warning.innerHTML = "";
  }
}

function chartOptions(yTitle) {
  return {
    responsive: true,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { labels: { usePointStyle: true, boxWidth: 8 } },
      tooltip: { callbacks: { label: context => context.dataset.label + ": " + euro(context.raw) } }
    },
    scales: {
      x: {
        title: { display: true, text: "Vuotta valmistumisesta" },
        grid: { color: "rgba(148, 163, 184, 0.10)" }
      },
      y: {
        title: { display: true, text: yTitle },
        ticks: { callback: value => euro(value) },
        grid: { color: "rgba(148, 163, 184, 0.10)" }
      }
    }
  };
}

function updateSummary(result) {
  const best = bestOf(result);

  document.getElementById("bestStrategy").textContent = best.name;
  document.getElementById("bestDetails").textContent =
    "Loppunettovarallisuus: " + euro(best.value) + " · " + result.extraRules.modeDescription;

  const bestLoanStrategy = Math.max(result.strategyA.finalNetWorth, result.strategyB.finalNetWorth);
  const loanBenefit = bestLoanStrategy - result.noLoan.finalNetWorth;
  const benefitEl = document.getElementById("loanBenefit");

  benefitEl.textContent = (loanBenefit >= 0 ? "+" : "") + euro(loanBenefit);
  benefitEl.className = loanBenefit >= 0 ? "positive" : "negative";
  document.getElementById("loanBenefitText").textContent =
    loanBenefit >= 0
      ? "Paras lainastrategia voittaa ei-lainaa-vaihtoehdon."
      : "Ei-lainaa-vaihtoehto voittaa tässä skenaariossa.";

  const strategyGap = result.strategyB.finalNetWorth - result.strategyA.finalNetWorth;
  const gapEl = document.getElementById("strategyGap");

  gapEl.textContent = (strategyGap >= 0 ? "+" : "") + euro(strategyGap);
  gapEl.className = strategyGap >= 0 ? "positive" : "negative";
  document.getElementById("strategyGapText").textContent =
    Math.abs(strategyGap) < 0.005 ? "Strategiat ovat tasoissa." : strategyGap > 0 ? "Strategia B voittaa strategian A." : "Strategia A voittaa strategian B.";
}

function updateCards(result) {
  const study = result.snapshot.withLoan;
  const creditInfo = result.snapshot.creditInfo;

  document.getElementById("totalLoanBig").textContent = euro(study.totalLoanDrawn);
  document.getElementById("graduationDetails").innerHTML =
    "Tukikuukausia: " + study.supportMonthCount + " kk<br>" +
    "Opiskeluaikaiset korot (arvio): " + euro(study.capitalizedInterest) + "<br>" +
    "Laina hyvityksen jälkeen: " + euro(result.snapshot.repaymentLoan) + "<br>" +
    "Salkku valmistuessa: " + euro(study.portfolio) + "<br>" +
    "Hyvitykseen oikeuttava laina: " + euro(creditInfo.eligibleLoan) + "<br>" +
    "Opintolainahyvitys: " + euro(creditInfo.credit) + "<br>" +
    "Sijoitettu pääoma: " + euro(study.investedPrincipal) + "<br>" +
    "Kulutukseen lainasta: " + euro(study.livingCostsFromLoan);

  document.getElementById("netNoLoan").textContent = euro(result.noLoan.finalNetWorth);
  document.getElementById("detailsNoLoan").innerHTML =
    "Kuukausisijoitus valmistumisen jälkeen: " + euro(result.inputs.postStudyInvest, 2) + "<br>" +
    "Salkku lopussa: " + euro(result.noLoan.finalPortfolio);

  document.getElementById("netA").textContent = euro(result.strategyA.finalNetWorth);
  document.getElementById("detailsA").innerHTML =
    "Takaisinmaksu: " + result.inputs.termA + " v<br>" +
    "Kuukausierä: " + euro(result.strategyA.payment, 2) + "<br>" +
    "Takaisinmaksuajan korot yhteensä: " + euro(result.strategyA.interestPaid) + "<br>" +
    "Salkku lopussa: " + euro(result.strategyA.finalPortfolio);

  document.getElementById("netB").textContent = euro(result.strategyB.finalNetWorth);
  document.getElementById("detailsB").innerHTML =
    "Takaisinmaksu: " + result.inputs.termB + " v<br>" +
    "Kuukausierä: " + euro(result.strategyB.payment, 2) + "<br>" +
    "Takaisinmaksuajan korot yhteensä: " + euro(result.strategyB.interestPaid) + "<br>" +
    "Salkku lopussa: " + euro(result.strategyB.finalPortfolio);
}

function updateTable(result) {
  const study = result.snapshot.withLoan;
  const noLoanStudy = result.snapshot.noLoan;
  const creditInfo = result.snapshot.creditInfo;

  document.getElementById("resultTable").innerHTML = `
    <tr><td>Kokonaislaina</td><td>0 €</td><td>${euro(study.totalLoanDrawn)}</td><td>${euro(study.totalLoanDrawn)}</td></tr>
    <tr><td>Salkku valmistuessa</td><td>${euro(noLoanStudy.portfolio)}</td><td>${euro(study.portfolio)}</td><td>${euro(study.portfolio)}</td></tr>
    <tr><td>Opintolainahyvitys</td><td>0 €</td><td>${euro(creditInfo.credit)}</td><td>${euro(creditInfo.credit)}</td></tr>
    <tr><td>Kuukausierä</td><td>–</td><td>${euro(result.strategyA.payment, 2)}</td><td>${euro(result.strategyB.payment, 2)}</td></tr>
    <tr><td>Vertailuperusteinen lyhennysero / kk</td><td>–</td><td>${result.inputs.strategyMode === "comparison" && result.strategyA.payment < result.strategyB.payment ? euro(result.paymentDifference, 2) : "–"}</td><td>${result.inputs.strategyMode === "comparison" && result.strategyB.payment < result.strategyA.payment ? euro(result.paymentDifference, 2) : "–"}</td></tr>
    <tr><td>Lainan maksut koko maksuajalta</td><td>–</td><td>${euro(result.strategyA.totalPaid)}</td><td>${euro(result.strategyB.totalPaid)}</td></tr>
    <tr><td>Korot koko takaisinmaksuajalta</td><td>–</td><td>${euro(result.strategyA.interestPaid)}</td><td>${euro(result.strategyB.interestPaid)}</td></tr>
    <tr><td>Salkku lopussa</td><td>${euro(result.noLoan.finalPortfolio)}</td><td>${euro(result.strategyA.finalPortfolio)}</td><td>${euro(result.strategyB.finalPortfolio)}</td></tr>
    <tr><td>Nettovarallisuus lopussa</td><td>${euro(result.noLoan.finalNetWorth)}</td><td>${euro(result.strategyA.finalNetWorth)}</td><td>${euro(result.strategyB.finalNetWorth)}</td></tr>
  `;
}

function drawMainChart(result) {
  if (typeof Chart === "undefined") return;
  if (mainChart) mainChart.destroy();

  mainChart = new Chart(document.getElementById("mainChart"), {
    type: "line",
    data: {
      labels: labelsFor(result.horizonMonths),
      datasets: [
        {
          label: "Nettovarallisuus, ei lainaa",
          data: result.noLoan.wealth,
          borderColor: COLORS.neutral,
          backgroundColor: COLORS.neutral,
          borderWidth: 2,
          pointRadius: 0
        },
        {
          label: "Nettovarallisuus, strategia A",
          data: result.strategyA.wealth,
          borderColor: COLORS.green,
          backgroundColor: COLORS.green,
          borderWidth: 2,
          pointRadius: 0
        },
        {
          label: "Nettovarallisuus, strategia B",
          data: result.strategyB.wealth,
          borderColor: COLORS.green2,
          backgroundColor: COLORS.green2,
          borderWidth: 2,
          pointRadius: 0
        },
        {
          label: "Lainapääoma, strategia A",
          data: result.strategyA.balances,
          borderColor: COLORS.red,
          backgroundColor: COLORS.red,
          borderWidth: 2,
          pointRadius: 0,
          borderDash: [7, 7]
        },
        {
          label: "Lainapääoma, strategia B",
          data: result.strategyB.balances,
          borderColor: COLORS.red2,
          backgroundColor: COLORS.red2,
          borderWidth: 2,
          pointRadius: 0,
          borderDash: [7, 7]
        }
      ]
    },
    options: chartOptions("Euroa")
  });
}

function runRandomPath() {
  const result = runModel({ random: true });
  const best = bestOf(result);

  document.getElementById("stochNoLoan").textContent = euro(result.noLoan.finalNetWorth);
  document.getElementById("stochA").textContent = euro(result.strategyA.finalNetWorth);
  document.getElementById("stochB").textContent = euro(result.strategyB.finalNetWorth);
  document.getElementById("stochBest").textContent = best.name;

  if (typeof Chart === "undefined") return;
  if (stochasticChart) stochasticChart.destroy();

  stochasticChart = new Chart(document.getElementById("stochasticChart"), {
    type: "line",
    data: {
      labels: labelsFor(result.horizonMonths),
      datasets: [
        {
          label: "Ei lainaa",
          data: result.noLoan.wealth,
          borderColor: COLORS.neutral,
          backgroundColor: COLORS.neutral,
          borderWidth: 2,
          pointRadius: 0
        },
        {
          label: "Strategia A",
          data: result.strategyA.wealth,
          borderColor: COLORS.green,
          backgroundColor: COLORS.green,
          borderWidth: 2,
          pointRadius: 0
        },
        {
          label: "Strategia B",
          data: result.strategyB.wealth,
          borderColor: COLORS.green2,
          backgroundColor: COLORS.green2,
          borderWidth: 2,
          pointRadius: 0
        }
      ]
    },
    options: chartOptions("Nettovarallisuus")
  });
}

const currentReturnLinePlugin = {
  id: "currentReturnLine",
  afterDatasetsDraw(chart, args, pluginOptions) {
    const currentReturn = pluginOptions.currentReturn;
    if (currentReturn === null || currentReturn === undefined) return;

    if (currentReturn * 100 < chart.scales.x.min || currentReturn * 100 > chart.scales.x.max) return;

    const { ctx, chartArea, scales } = chart;
    const x = scales.x.getPixelForValue(currentReturn * 100);

    ctx.save();
    ctx.strokeStyle = COLORS.yellow;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.fillStyle = COLORS.yellow;
    ctx.font = "700 12px Inter, Arial";
    ctx.fillText("nykyinen", x + 6, chartArea.top + 16);
    ctx.restore();
  }
};

if (typeof Chart !== "undefined") Chart.register(currentReturnLinePlugin);

function findBreakeven(labels, noLoanValues, strategyAValues, strategyBValues) {
  const gaps = labels.map((_, i) => Math.max(strategyAValues[i], strategyBValues[i]) - noLoanValues[i]);
  if (gaps.every(value => Math.abs(value) < 0.005)) return "tasatulos koko välillä";
  if (gaps.every(value => value >= 0)) return "laina vähintään tasoissa koko välillä";
  const changes = [];
  gaps.forEach((value, i) => { if (Math.abs(value) < 0.005) changes.push(percentLabel(labels[i])); });
  for (let i = 1; i < gaps.length; i++) {
    if ((gaps[i-1] < 0 && gaps[i] >= 0) || (gaps[i-1] > 0 && gaps[i] <= 0))
      changes.push(percentLabel(labels[i-1]) + " … " + percentLabel(labels[i]));
  }
  if (changes.length) return "Arvio: " + changes.join("; ");
  return "ei tällä välillä";
}

function drawSensitivity() {
  const minReturn = readNumber("sensitivityMin") / 100;
  const maxReturn = readNumber("sensitivityMax") / 100;
  const currentReturn = readNumber("investmentReturn") / 100;
  if (minReturn >= maxReturn) throw new Error("Herkkyysanalyysin minimin on oltava maksimia pienempi.");
  const steps = 120;

  const labels = [];
  const noLoanValues = [];
  const strategyAValues = [];
  const strategyBValues = [];

  for (let i = 0; i <= steps; i++) {
    const assumedReturn = minReturn + (maxReturn - minReturn) * i / steps;
    const result = runModel({ random: false, overrideReturn: assumedReturn });

    labels.push(assumedReturn * 100);
    noLoanValues.push(result.noLoan.finalNetWorth);
    strategyAValues.push(result.strategyA.finalNetWorth);
    strategyBValues.push(result.strategyB.finalNetWorth);
  }

  const currentResult = runModel({ random: false, overrideReturn: currentReturn });
  const best = bestOf(currentResult);
  const breakeven = findBreakeven(labels, noLoanValues, strategyAValues, strategyBValues);

  document.getElementById("currentReturnLabel").textContent = percentLabel(currentReturn * 100);
  document.getElementById("sensitivityBest").textContent = best.name;
  document.getElementById("breakevenReturn").textContent = breakeven;

  if (typeof Chart === "undefined") return;
  if (sensitivityChart) sensitivityChart.destroy();

  sensitivityChart = new Chart(document.getElementById("sensitivityChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Ei lainaa",
          data: noLoanValues.map((y, i) => ({ x: labels[i], y })),
          borderColor: COLORS.neutral,
          backgroundColor: COLORS.neutral,
          borderWidth: 2,
          pointRadius: 0
        },
        {
          label: "Strategia A",
          data: strategyAValues.map((y, i) => ({ x: labels[i], y })),
          borderColor: COLORS.green,
          backgroundColor: COLORS.green,
          borderWidth: 2,
          pointRadius: 0
        },
        {
          label: "Strategia B",
          data: strategyBValues.map((y, i) => ({ x: labels[i], y })),
          borderColor: COLORS.green2,
          backgroundColor: COLORS.green2,
          borderWidth: 2,
          pointRadius: 0
        }
      ]
    },
    options: {
      ...chartOptions("Loppunettovarallisuus"),
      scales: { ...chartOptions("Loppunettovarallisuus").scales, x: { type: "linear", min: minReturn * 100, max: maxReturn * 100, title: { display: true, text: "Sijoitusten vuosituotto, %" }, ticks: { callback: value => percentLabel(value) } } },
      plugins: {
        ...chartOptions("Loppunettovarallisuus").plugins,
        currentReturnLine: { currentReturn }
      }
    }
  });
}

function calculate() {
  try {
  for (const id of Object.keys(INPUT_LIMITS)) readNumber(id);
  if (readNumber("sensitivityMin") >= readNumber("sensitivityMax")) throw new Error("Herkkyysanalyysin minimin on oltava maksimia pienempi.");
  document.getElementById("results").style.display = "block";
  setWarning();

  const result = runModel({ random: false });

  updateSummary(result);
  updateCards(result);
  updateTable(result);
  drawMainChart(result);
  runRandomPath();
  drawSensitivity();
  } catch (error) {
    document.getElementById("results").style.display = "none";
    document.getElementById("bestStrategy").textContent = "Tarkista syötteet";
    document.getElementById("bestDetails").textContent = "Tuloksia ei ole laskettu näillä syötteillä.";
    const warning = document.getElementById("warning");
    warning.style.display = "block";
    warning.textContent = error.message;
  }
}

/* -----------------------------
   Lightweight consistency tests
----------------------------- */

function runInternalTests() {
  const testReturns = constantReturns(60, monthlyReturn(0.08));

  const baseInputs = {
    studyYears: 5,
    degreeLoanCap: 18000,
    studyStartPeriod: "since2017",
    usedSupportMonths: 0,
    supportMonths: 9,
    loanPerMonth: 850,
    investFromLoan: 300,
    postStudyInvest: 300,
    annualReturn: 0.08,
    loanMonthlyRate: 0.03 / 12,
    termA: 10,
    termB: 20,
    horizonMonths: 240,
    useCredit: true,
    reinvestFreedPayments: true,
    volatility: 0.15
  };

  const lowerLoanInputs = { ...baseInputs, loanPerMonth: 400 };

  const a = simulateStudyPeriod(baseInputs, testReturns, true);
  const b = simulateStudyPeriod(lowerLoanInputs, testReturns, true);

  console.assert(
    Math.abs(a.portfolio - b.portfolio) < 0.01,
    "Study portfolio should not depend on loan draw if invested amount is unchanged."
  );

  console.assert(
    a.totalLoanDrawn !== b.totalLoanDrawn,
    "Total loan should depend on monthly draw."
  );

  const creditA = calculateStudentLoanCredit(a.supportMonthCount, baseInputs.loanPerMonth, true);
  const creditB = calculateStudentLoanCredit(b.supportMonthCount, lowerLoanInputs.loanPerMonth, true);

  console.assert(
    Math.abs(creditA.credit - creditB.credit) < 0.01,
    "Credit should be same for 850 €/month and 400 €/month because eligible cap is 400 €/month."
  );
}

document.getElementById("calculateButton").addEventListener("click", calculate);
document.getElementById("randomPathButton").addEventListener("click", calculate);
window.addEventListener("load", () => {
  runInternalTests();
  calculate();
});
