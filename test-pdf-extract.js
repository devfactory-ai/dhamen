const fs = require('fs');
const zlib = require('zlib');

const buf = fs.readFileSync('/home/sirine/Bureau/dhamen/example contract.pdf');
const raw = buf.toString('latin1');

// Extract text (same logic as the Worker code)
const streamRegex = /stream\r?\n([\s\S]*?)endstream/g;
let m;
const textParts = [];
while ((m = streamRegex.exec(raw)) !== null) {
  const content = m[1];
  const before = raw.substring(Math.max(0, m.index - 200), m.index);
  const isCompressed = /FlateDecode/.test(before);
  const strRegex = /\(([^)]*)\)/g;
  let sm;

  if (isCompressed) {
    try {
      const data = Buffer.from(content, 'latin1');
      const decompressed = zlib.inflateSync(data).toString('latin1');
      while ((sm = strRegex.exec(decompressed)) !== null) {
        const t = sm[1].trim();
        if (t.length > 0) textParts.push(t);
      }
    } catch(e) {
      try {
        const data = Buffer.from(content, 'latin1');
        const decompressed = zlib.inflateRawSync(data).toString('latin1');
        while ((sm = strRegex.exec(decompressed)) !== null) {
          const t = sm[1].trim();
          if (t.length > 0) textParts.push(t);
        }
      } catch(e2) {}
    }
  } else {
    while ((sm = strRegex.exec(content)) !== null) {
      const t = sm[1].trim();
      if (t.length > 0) textParts.push(t);
    }
  }
}

const text = textParts.join(' ');

function spaced(word) {
  return word.split('').join('\\s*');
}

function normalizePdfText(t) {
  return t.replace(/fr-FR/g, ' ').replace(/\s+/g, ' ').trim();
}

const normalized = normalizePdfText(text);

// Test SOUSCRIPTEUR
const souscRegex = new RegExp(spaced('SOUSCRIPTEUR') + '\\s*:?\\s*(.+?)(?=' + spaced('ADRESSE') + '|' + spaced('MATRICULE') + '|$)', 'is');
const souscMatch = normalized.match(souscRegex);
console.log('SOUSCRIPTEUR:', souscMatch ? souscMatch[1].replace(/\s+/g, ' ').trim().substring(0, 100) : 'NOT FOUND');

// Test ADRESSE
const adresseRegex = new RegExp(spaced('ADRESSE') + '\\s*:?\\s*(.+?)(?=' + spaced('MATRICULE') + '|' + spaced('EFFET') + '|$)', 'is');
const adresseMatch = normalized.match(adresseRegex);
console.log('ADRESSE:', adresseMatch ? adresseMatch[1].replace(/\s+/g, ' ').trim().substring(0, 100) : 'NOT FOUND');

// Test MATRICULE — stop at EFFET
const matriculeRegex = new RegExp(spaced('MATRICULE') + '\\s*' + spaced('FISCAL') + '[E\\s]*:?\\s*([A-Z0-9][A-Z0-9\\s]*[A-Z0-9])(?=\\s*' + spaced('EFFET') + '|\\s*$)', 'i');
const matriculeMatch = normalized.match(matriculeRegex);
console.log('MATRICULE:', matriculeMatch ? matriculeMatch[1].replace(/\s/g, '').trim() : 'NOT FOUND');

// Test N°
const contractNumRegex = /N[°o]\s*([0-9][0-9\s]+[0-9])/i;
const contractNumMatch = normalized.match(contractNumRegex);
console.log('CONTRACT N°:', contractNumMatch ? contractNumMatch[1].replace(/\s/g, '') : 'NOT FOUND');

// Test BH ASSURANCE
const bhRegex = new RegExp(spaced('BH') + '\\s*' + spaced('ASSURANCE'), 'i');
const bhMatch = normalized.match(bhRegex);
console.log('BH ASSURANCE:', bhMatch ? bhMatch[0].replace(/\s+/g, ' ').trim() : 'NOT FOUND');

// Test EFFET DU CONTRAT
const monthNames = ['JANVIER', 'FEVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOUT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DECEMBRE'];
const monthPattern = monthNames.map(m => spaced(m)).join('|');
const effetRegex = new RegExp(
  spaced('EFFET') + '\\s*(?:' + spaced('DU') + '\\s*' + spaced('CONTRAT') + ')?\\s*:?\\s*(?:' + spaced('LE') + '\\s*)?' +
  '(\\d[\\d\\s]*)\\s*(?:er|[èe]me)?\\s*(' + monthPattern + ')\\s*(\\d[\\d\\s]*)',
  'i'
);
const effetMatch = normalized.match(effetRegex);
console.log('EFFET:', effetMatch ? effetMatch[1].replace(/\s/g,'') + ' ' + effetMatch[2].replace(/\s/g,'') + ' ' + effetMatch[3].replace(/\s/g,'') : 'NOT FOUND');

// Test Intermediaire
const intermRegex = new RegExp(spaced('Interm') + '[ée\\s]*' + spaced('diaire') + '\\s*:?\\s*(.+?)(?=' + spaced('Code') + '|$)', 'i');
const intermMatch = normalized.match(intermRegex);
console.log('INTERMEDIAIRE:', intermMatch ? intermMatch[1].replace(/\s+/g, ' ').trim().substring(0, 100) : 'NOT FOUND');

// Test Code — stop before section numbers
const codeRegex = new RegExp(spaced('Code') + '\\s*:?\\s*([0-9][0-9\\s]{0,20})(?=\\s*\\d\\s*\\.\\s*\\d|\\s*' + spaced('RISQ') + '|\\s*$)', 'i');
const codeMatch = normalized.match(codeRegex);
console.log('CODE:', codeMatch ? codeMatch[1].replace(/\s/g, '').trim() : 'NOT FOUND');

// Test ECHEANCE
const echeanceRegex = new RegExp(
  spaced('ECHEANCE') + '\\s*' + spaced('ANNUELLE') + '\\s*:?\\s*(?:' + spaced('LE') + '\\s*)?' +
  '(\\d[\\d\\s]*)\\s*(?:er|[èe]me)?\\s*(' + monthPattern + ')',
  'i'
);
const echeanceMatch = normalized.match(echeanceRegex);
console.log('ECHEANCE:', echeanceMatch ? echeanceMatch[1].replace(/\s/g,'') + ' ' + echeanceMatch[2].replace(/\s/g,'') : 'NOT FOUND');
