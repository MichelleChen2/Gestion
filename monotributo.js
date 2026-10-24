const DEFAULT_ALERT_DAYS = Number(process.env.MONOTRIBUTO_ALERT_DAYS || 5);

function cleanDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function toIsoDate(token) {
  const match = String(token || '').trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4}|\d{2})$/);
  if (!match) return null;
  let [,dd,mm,yyyy] = match;
  if (yyyy.length === 2) yyyy = Number(yyyy) >= 70 ? `19${yyyy}` : `20${yyyy}`;
  const y=Number(yyyy), m=Number(mm), d=Number(dd);
  const date = new Date(Date.UTC(y,m-1,d));
  if (date.getUTCFullYear()!==y || date.getUTCMonth()!==m-1 || date.getUTCDate()!==d) return null;
  return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function todayIso(now=new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())).toISOString().slice(0,10);
}

function diffDays(fromIso,toIso) {
  if (!fromIso || !toIso) return null;
  const a=new Date(`${fromIso}T00:00:00Z`), b=new Date(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b-a)/86400000);
}

function findLabeledDate(text, labelPattern) {
  const rx = new RegExp(`(?:${labelPattern})\\s*(?:[:\\-]|es|el)?\\s*(\\d{1,2}[\\/.-]\\d{1,2}[\\/.-](?:\\d{4}|\\d{2}))`, 'i');
  const match=String(text||'').match(rx);
  return match ? toIsoDate(match[1]) : null;
}

// Importante: NO se calcula una vigencia usando reglas externas.
// Solo se toma una fecha de vencimiento explícita que figure en el PDF.
function extractValidityDates(text) {
  const normalized=normalizeText(text);
  const expiryLabels = [
    'fecha de vencimiento','fecha vencimiento','vencimiento',
    'vigente hasta','vigencia hasta','valida hasta','valido hasta'
  ].join('|');
  const issueLabels = [
    'fecha de emision','fecha emision','emitida el','emitido el',
    'fecha de generacion','generada el','generado el','fecha de impresion','fecha impresion'
  ].join('|');
  const expiresAt=findLabeledDate(normalized,expiryLabels);
  let issuedAt=findLabeledDate(normalized,issueLabels);
  if (!issuedAt) issuedAt=findLabeledDate(normalized,'fecha de emision|fecha emision');
  return {issuedAt,expiresAt,source:expiresAt?'explicit_expiry':'missing_expiry'};
}

function findCuits(text) {
  const raw=String(text||'');
  const matches=raw.match(/\b(?:20|23|24|27|30|33|34)[-\s]?\d{8}[-\s]?\d\b/g) || [];
  return [...new Set(matches.map(cleanDigits).filter(x=>x.length===11))];
}

function statusForExpiry(expiresAt,{now=new Date(),alertDays=DEFAULT_ALERT_DAYS}={}) {
  if (!expiresAt) return {status:'unknown',daysRemaining:null};
  const daysRemaining=diffDays(todayIso(now),expiresAt);
  if (daysRemaining === null) return {status:'unknown',daysRemaining:null};
  if (daysRemaining < 0) return {status:'expired',daysRemaining};
  if (daysRemaining <= alertDays) return {status:'expiring',daysRemaining};
  return {status:'valid',daysRemaining};
}

function validateMonotributoText(text, expectedCuit, options={}) {
  const alertDays=Number(options.alertDays ?? DEFAULT_ALERT_DAYS);
  const now=options.now || new Date();
  const normalized=normalizeText(text);

  // Se mantienen los controles del prototipo que ya existían:
  // que parezca una constancia y que el CUIT coincida.
  // NO se consulta ARCA ni ningún servicio externo.
  const documentLooksValid = normalized.includes('monotributo') ||
    normalized.includes('monotributista') ||
    normalized.includes('constancia de opcion');
  const expected=cleanDigits(expectedCuit);
  const foundCuits=findCuits(text);
  const cuitMatches=expected.length===11 && foundCuits.includes(expected);

  const {issuedAt,expiresAt,source}=extractValidityDates(text);
  const expiry=statusForExpiry(expiresAt,{now,alertDays});
  const valid = documentLooksValid && cuitMatches && !!expiresAt && expiry.status !== 'expired';

  let message='Constancia vigente.';
  if (!documentLooksValid) message='El PDF no parece corresponder a una constancia de monotributo.';
  else if (!cuitMatches) message='El CUIT de la constancia no coincide con el asociado.';
  else if (!expiresAt) message='No se pudo encontrar una fecha de vencimiento en la constancia.';
  else if (expiry.status==='expired') message=`La constancia está vencida desde el ${expiresAt}.`;
  else if (expiry.status==='expiring') message=`La constancia está vigente, pero vence en ${expiry.daysRemaining} día${expiry.daysRemaining===1?'':'s'} (${expiresAt}).`;

  return {
    valid,
    documentLooksValid,
    cuitMatches,
    expectedCuit: expected,
    foundCuits,
    issuedAt,
    expiresAt,
    validitySource: source,
    alertDays,
    status: expiry.status,
    daysRemaining: expiry.daysRemaining,
    checkedAgainstDate: todayIso(now),
    message
  };
}

async function validateMonotributoBuffer(buffer, expectedCuit, options={}) {
  const pdfParse=require('pdf-parse');
  const parsed=await pdfParse(buffer);
  return validateMonotributoText(parsed.text || '', expectedCuit, options);
}

module.exports={
  DEFAULT_ALERT_DAYS,cleanDigits,normalizeText,toIsoDate,todayIso,diffDays,
  extractValidityDates,findCuits,statusForExpiry,validateMonotributoText,validateMonotributoBuffer
};
