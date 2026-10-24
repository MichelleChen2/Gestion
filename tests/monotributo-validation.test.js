const assert=require('assert');
const {validateMonotributoText}=require('../monotributo');
const now=new Date('2026-10-24T12:00:00Z');

let x=validateMonotributoText(
  'CONSTANCIA DE OPCION MONOTRIBUTO CUIT 27-36777123-2 Fecha de emisión: 20/10/2026 Fecha de vencimiento: 15/11/2026',
  '27-36777123-2',{now,alertDays:5});
assert.equal(x.valid,true);assert.equal(x.expiresAt,'2026-11-15');assert.equal(x.status,'valid');

x=validateMonotributoText(
  'CONSTANCIA DE OPCION MONOTRIBUTO CUIT 27-36777123-2 Fecha de vencimiento: 25/10/2026',
  '27-36777123-2',{now,alertDays:5});
assert.equal(x.valid,true);assert.equal(x.status,'expiring');assert.equal(x.daysRemaining,1);

x=validateMonotributoText(
  'CONSTANCIA DE OPCION MONOTRIBUTO CUIT 27-36777123-2 Fecha de vencimiento: 16/10/2026',
  '27-36777123-2',{now,alertDays:5});
assert.equal(x.valid,false);assert.equal(x.status,'expired');

x=validateMonotributoText(
  'CONSTANCIA DE OPCION MONOTRIBUTO CUIT 20-30123456-9 Fecha de vencimiento: 15/11/2026',
  '27-36777123-2',{now,alertDays:5});
assert.equal(x.valid,false);assert.equal(x.cuitMatches,false);

x=validateMonotributoText(
  'CONSTANCIA DE OPCION MONOTRIBUTO CUIT 27-36777123-2 Fecha de emisión: 20/10/2026',
  '27-36777123-2',{now,alertDays:5});
assert.equal(x.valid,false);assert.equal(x.status,'unknown');assert.equal(x.expiresAt,null);

console.log('OK: vencimiento explícito comparado con fecha actual');
