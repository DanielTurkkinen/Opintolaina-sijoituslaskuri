'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

const defaults = {
  studyYears: 5,
  supportMonths: 9,
  loanPerMonth: 850,
  investFromLoan: 300,
  postStudyInvest: 300,
  investmentReturn: 8,
  loanRate: 3,
  termA: 10,
  termB: 20,
  horizonYears: 20,
  degreeLoanCap: 18000,
  studyStartPeriod: 'since2017',
  usedSupportMonths: 0,
  useCredit: true,
  reinvestFreedPayments: true,
  strategyMode: 'independent',
  volatility: 15,
  sensitivityMin: 0,
  sensitivityMax: 12
};

function loadModel(overrides = {}) {
  const inputs = { ...defaults, ...overrides };
  const document = {
    getElementById(id) {
      if (!(id in inputs) && id !== 'calculateButton' && id !== 'randomPathButton') {
        throw new Error('Unrecognized model input: ' + id);
      }
      return {
        value: String(inputs[id] ?? ''),
        checked: Boolean(inputs[id]),
        setAttribute() {},
        addEventListener() {},
        closest() { return null; }
      };
    }
  };

  const context = vm.createContext({
    document,
    window: { addEventListener() {} },
    console,
    Chart: undefined
  });
  vm.runInContext(source + '\n;globalThis.__model = {' +
    'runModel, monthlyPayment, remainingBalance, monthlyReturn, ' +
    'getStudyCalendar, getSupportLimit, simulateStudyPeriod, constantReturns, ' +
    'calculateStudentLoanCredit, createExtraInvestmentRules, buildRepaymentPlan' +
    '};', context, { filename: 'app.js' });

  return context.__model;
}

function near(actual, expected, tolerance = 0.01) {
  assert.ok(Number.isFinite(actual), 'expected a finite number, got ' + actual);
  assert.ok(Math.abs(actual - expected) <= tolerance,
    'expected ' + actual + ' to be within ' + tolerance + ' of ' + expected);
}

test('original default scenario remains stable during migration', () => {
  const model = loadModel();
  const result = model.runModel();
  assert.equal(result.snapshot.withLoan.supportMonthCount, 45);
  near(result.snapshot.withLoan.totalLoanDrawn, 38250);
  near(result.snapshot.creditInfo.credit, 6200);
  near(result.snapshot.repaymentLoan, 35269.660537542266);
  near(result.planA.payment, 340.56646867644827);
  near(result.planB.payment, 195.60469011243856);
  near(result.strategyA.finalNetWorth,
    result.strategyA.finalPortfolio - result.strategyA.finalBalance);
});

test('zero interest annuity is principal divided by months', () => {
  const model = loadModel();
  near(model.monthlyPayment(1200, 0, 12), 100, 1e-9);
  near(model.remainingBalance(1200, 0, 100, 6, 12), 600, 1e-9);
  near(model.remainingBalance(1200, 0, 100, 12, 12), 0, 1e-9);
  near(model.monthlyReturn(0), 0, 1e-12);
});

test('support-month limit is applied independently of study length', () => {
  const model = loadModel({ studyYears: 6, usedSupportMonths: 3 });
  const result = model.runModel();
  assert.equal(result.snapshot.withLoan.supportMonthCount, 45);
  assert.equal(result.calendar.requestedSupportMonths, 54);
  assert.equal(result.calendar.supportMonthsTotal, 45);
});

test('increasing loan draw alone does not change the study portfolio', () => {
  const model = loadModel();
  const base = {
    studyYears: 5, supportMonths: 9, loanPerMonth: 400,
    investFromLoan: 300, degreeLoanCap: 18000, studyStartPeriod: 'since2017',
    usedSupportMonths: 0, loanMonthlyRate: 0.03 / 12
  };
  const returns = model.constantReturns(60, model.monthlyReturn(0.08));
  const low = model.simulateStudyPeriod(base, returns, true);
  const high = model.simulateStudyPeriod({ ...base, loanPerMonth: 850 }, returns, true);
  near(low.portfolio, high.portfolio);
  assert.notEqual(low.totalLoanDrawn, high.totalLoanDrawn);
  near(model.calculateStudentLoanCredit(45, 400, true).credit,
    model.calculateStudentLoanCredit(45, 850, true).credit);
});

test('zero loan results in zero repayment, even if credit toggle is on', () => {
  const result = loadModel({ loanPerMonth: 0, investFromLoan: 0 }).runModel();
  near(result.snapshot.withLoan.totalLoanDrawn, 0);
  near(result.snapshot.creditInfo.credit, 0);
  near(result.planA.payment, 0);
  near(result.planB.payment, 0);
});

test('strategy comparison allocates monthly payment difference to lower payment', () => {
  const model = loadModel({ strategyMode: 'comparison' });
  const result = model.runModel();
  const diff = result.planA.payment - result.planB.payment;
  assert.ok(diff > 0);
  near(result.extraRules.extraA(1, result.planA.payment), 0);
  near(result.extraRules.extraB(1, result.planB.payment), diff);
  near(result.extraRules.extraB(result.planB.months + 1, result.planB.payment),
    result.planA.payment);
});

test('invalid previously-used support months are rejected', () => {
  const model = loadModel({ usedSupportMonths: 49 });
  assert.throws(() => model.runModel(), /Aiemmin käytettyjä tukikuukausia/);
});

test('minus 100 percent annual return produces finite results', () => {
  const model = loadModel({ investmentReturn: -100, volatility: 0 });
  const result = model.runModel();
  near(model.monthlyReturn(-1), -1, 1e-12);
  assert.ok(Number.isFinite(result.strategyA.finalNetWorth));
  assert.ok(Number.isFinite(result.strategyB.finalNetWorth));
});
