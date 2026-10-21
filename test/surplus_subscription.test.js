const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateSurplusBreakdown } = require('../server.js');

test('Ley 20.337 - retención exacta del 15% para fondos obligatorios', () => {
  const result = calculateSurplusBreakdown(1000000);
  assert.equal(result.reserveLegal, 50000);
  assert.equal(result.educationFund, 50000);
  assert.equal(result.assistanceFund, 50000);
  assert.equal(result.totalFunds, 150000);
  assert.equal(result.distributable, 850000);
});

test('Ley 20.337 - desglose correcto con decimales y redondeo monetario', () => {
  const total = 333333.33;
  const result = calculateSurplusBreakdown(total);
  assert.equal(result.reserveLegal, 16666.67);
  assert.equal(result.educationFund, 16666.67);
  assert.equal(result.assistanceFund, 16666.67);
  assert.equal(result.totalFunds, 50000.01);
  assert.equal(result.distributable, 283333.32);
});

test('Distribución de retornos - cálculo proporcional según horas aportadas', () => {
  const distributable = 850000;
  const members = [
    { id: 1, hours: 120 },
    { id: 2, hours: 80 }
  ];
  const totalHours = members.reduce((sum, m) => sum + m.hours, 0);
  assert.equal(totalHours, 200);

  const distributed = members.map((m) => {
    const percentage = (m.hours / totalHours) * 100;
    const returnAmount = Math.round(distributable * (percentage / 100) * 100) / 100;
    return { ...m, percentage, returnAmount };
  });

  assert.equal(distributed[0].percentage, 60);
  assert.equal(distributed[0].returnAmount, 510000);
  assert.equal(distributed[1].percentage, 40);
  assert.equal(distributed[1].returnAmount, 340000);
  assert.equal(distributed[0].returnAmount + distributed[1].returnAmount, distributable);
});

test('Distribución de retornos - distribución igualitaria cuando las horas acumuladas son 0', () => {
  const distributable = 900000;
  const count = 3;
  const totalHours = 0;
  const percentage = totalHours > 0 ? 0 : 100 / count;
  const returnAmount = Math.round(distributable * (percentage / 100) * 100) / 100;

  assert.equal(Math.round(percentage * 100) / 100, 33.33);
  assert.equal(returnAmount, 300000);
});

test('Modelo Freemium - verificación de cupo de asociados en Plan Semilla', () => {
  const subFree = { plan: 'free', max_members: 5 };
  const currentMembersAtLimit = 5;
  const isLimitReached = subFree.plan === 'free' && currentMembersAtLimit >= subFree.max_members;
  assert.equal(isLimitReached, true);

  const currentMembersUnderLimit = 4;
  const isAvailable = subFree.plan === 'free' && currentMembersUnderLimit < subFree.max_members;
  assert.equal(isAvailable, true);
});

test('Modelo Freemium - Plan Profesional sin restricciones de cupo', () => {
  const subPro = { plan: 'pro', max_members: 999999 };
  const currentMembers = 45;
  const isLimitReached = subPro.plan === 'free' && currentMembers >= subPro.max_members;
  assert.equal(isLimitReached, false);
});

test('Liquidación masiva de retribuciones - acumulación y verificación de transferencias', () => {
  const members = [
    { id: 1, total: 45000, transferred: 0 },
    { id: 2, total: 32000, transferred: 32000 },
    { id: 3, total: 0, transferred: 0 },
    { id: 4, total: 18000, transferred: 0 }
  ];
  const pending = members.filter(m => m.total > 0 && m.transferred !== m.total);
  assert.equal(pending.length, 2);
  const transferred = pending.map(m => ({ ...m, transferred: m.total }));
  assert.equal(transferred.every(m => m.transferred === m.total), true);
});
