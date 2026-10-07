/**
 * ABMC de frases para estudiar idiomas
 * Backend de Apps Script. La app funciona como web app y también como diálogo
 * modal sobre el Sheet.
 *
 * Hoja "Frases":
 * A: ID | B: Frase objetivo | C: Traducción | D: Notas | E: Estado | F: Etiquetas
 * G: Creado | H: Actualizado | I: Incluida en material | J: Pronunciación | K: Kanji con furigana
 *
 * Regla de rendimiento: toda operación cuesta UNA lectura y UNA escritura.
 * El formato de la hoja se aplica sólo en setupSheet(), nunca al leer o guardar.
 */

const SHEET_NAME = 'Frases';
const SPREADSHEET_ID_PROPERTY = 'APP_SPREADSHEET_ID';
const LANGUAGE_PROPERTY = 'APP_TARGET_LANGUAGE';
const COLLECTION_SHEET_NAME = 'Colecciones';
const COLLECTION_HEADERS = ['ID', 'Nombre', 'Creado', 'Actualizado'];
const COLLECTION_COL = { ID: 1, NAME: 2, CREATED: 3, UPDATED: 4 };
const COLLECTION_WIDTH = COLLECTION_HEADERS.length;
const COLLECTION_MEMBER_SHEET_NAME = 'ColeccionesFrases';
const COLLECTION_MEMBER_HEADERS = ['Colección ID', 'Frase ID', 'Posición'];
const COLLECTION_MEMBER_COL = { COLLECTION_ID: 1, PHRASE_ID: 2, POSITION: 3 };
const COLLECTION_MEMBER_WIDTH = COLLECTION_MEMBER_HEADERS.length;
const COLLECTION_ID_PREFIX = 'C';
const UNASSIGNED_COLLECTION_ID = '__unassigned__';
const ALL_COLLECTION_NAME = 'Todas';
const ALL_PRINT_SCOPE = 'all';
const COLLECTION_PRINT_SCOPE = 'collections';

const HEADERS = [
  'ID', 'Frase objetivo', 'Traducción', 'Notas', 'Estado', 'Etiquetas', 'Creado', 'Actualizado', 'Incluida en material', 'Pronunciación', 'Kanji con furigana'
];

const COL = { ID: 1, DE: 2, ES: 3, NOTES: 4, STATUS: 5, TAGS: 6, CREATED: 7, UPDATED: 8, PRINTED_AT: 9, PRONUNCIATION: 10, KANA: 11 };
const WIDTH = HEADERS.length;

const STATUSES = ['Nueva', 'En práctica', 'Dominada'];
const DEFAULT_STATUS = 'Nueva';

const STATUS_COLOR = {
  'Nueva': '#eef2f6',
  'En práctica': '#fdf0dd',
  'Dominada': '#e2f2f0'
};

const ID_PREFIX = 'F';
const ID_PAD = 4;
const MIGRATE_RECORDED_TO = 'En práctica';

const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const ETYMOLOGY_INSTRUCTION = [
  'Eres un analista lingüístico de precisión.',
  'Cada vez que te envíe una palabra o frase corta, analízala utilizando exactamente la estructura siguiente.',
  'Sé conciso, directo y fácil de leer de un vistazo.',
  'Omite introducciones, despedidas y relleno conversacional.',
  '',
  'Estructura:',
  '',
  '[Palabra/Frase]',
  '1. Desglose etimológico',
  'Presenta (no en tabla) un análisis desglosado de la palabra en sus componentes exactos (prefijos, raíces, sufijos, elementos de enlace).',
  'Datos: Componente | Tipo | Significado literal / Función',
  '',
  '2. Traducción literal y real',
  'Traducción literal: La traducción exacta palabra por palabra según sus componentes.',
  'Significado real: La traducción idiomática y precisa en contexto.'
].join('\n');

/* ------------------------------------------------------------------ */
/* Menú y diálogo                                                      */
/* ------------------------------------------------------------------ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Sprache Lernen App')
    .addItem('Abrir app', 'showApp')
    .addSeparator()
    .addItem('Preparar hoja', 'setupSheet')
    .addItem('Migrar desde "Grabado"', 'migrateSheet')
    .addToUi();
}

function showApp() {
  registerSpreadsheet_();
  const html = HtmlService.createHtmlOutputFromFile('App')
    .setWidth(1000)
    .setHeight(640);
  SpreadsheetApp.getUi().showModalDialog(html, 'Sprache Lernen App');
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('App')
    .setTitle('Sprache Lernen App')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .addMetaTag('mobile-web-app-capable', 'yes')
    .addMetaTag('apple-mobile-web-app-capable', 'yes');
}

/* ------------------------------------------------------------------ */
/* Hoja: lectura barata, formato aparte                                */
/* ------------------------------------------------------------------ */

/** Ruta caliente: devuelve la hoja sin tocar formato. */
function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_ID_PROPERTY) ||
    (typeof PRODUCTION_SPREADSHEET_ID === 'string' ? PRODUCTION_SPREADSHEET_ID : '');
  if (!id) throw new Error('Abrí la app una vez desde el menú Frases de su Google Sheet.');
  return SpreadsheetApp.openById(id);
}

function registerSpreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('Abrí esta función desde el menú de un Google Sheet.');
  PropertiesService.getScriptProperties().setProperty(SPREADSHEET_ID_PROPERTY, active.getId());
}

function targetLanguage_() {
  const saved = PropertiesService.getScriptProperties().getProperty(LANGUAGE_PROPERTY);
  const language = saved ? JSON.parse(saved) : { name: 'alemán', locale: 'de-DE' };
  language.translation = language.translation || { name: 'español', locale: 'es-ES' };
  language.version = Number(language.version) || 0;
  return language;
}

function assertLanguageVersion_(expectedVersion) {
  if (!Number.isInteger(expectedVersion) || expectedVersion !== targetLanguage_().version) {
    throw new Error('El idioma cambió. Actualizá los datos antes de continuar.');
  }
}

function languageHeading_() {
  const language = targetLanguage_();
  return language.locale === 'de-DE' ? 'Deutsch' : language.name.charAt(0).toUpperCase() + language.name.slice(1);
}

function saveLanguageSettings(payload) {
  function validatedLanguage(value) {
    if (!value || typeof value.name !== 'string' || typeof value.locale !== 'string') {
      throw new Error('Elegí un idioma y un código de idioma válido.');
    }
    const name = normalize_(value.name).toLowerCase();
    const locale = normalize_(value.locale);
    if (!name || name.length > 40 || /[<>:"/\\|?*\r\n\x00-\x1f]/.test(name) ||
        !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)) {
      throw new Error('Elegí un idioma y un código válido, por ejemplo fr-FR.');
    }
    return { name: name, locale: locale };
  }
  const target = validatedLanguage(payload);
  const translation = validatedLanguage(payload.translation || targetLanguage_().translation);
  return withLock_(function () {
    assertLanguageVersion_(payload.expectedVersion);
    const properties = PropertiesService.getScriptProperties();
    const previous = properties.getProperty(LANGUAGE_PROPERTY);
    const current = targetLanguage_();
    const changed = current.name !== target.name || current.locale !== target.locale ||
      current.translation.name !== translation.name || current.translation.locale !== translation.locale;
    const language = { name: target.name, locale: target.locale, translation: translation, version: current.version + (changed ? 1 : 0) };
    const sheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
    const heading = sheet ? sheet.getRange(1, COL.DE, 1, 2) : null;
    const previousHeading = heading ? heading.getValues() : null;
    properties.setProperty(LANGUAGE_PROPERTY, JSON.stringify(language));
    try {
      if (heading) heading.setValues([['Frase (' + target.locale.split('-')[0].toUpperCase() + ')',
        'Traducción (' + translation.locale.split('-')[0].toUpperCase() + ')']]);
    } catch (error) {
      try {
        if (previous === null) properties.deleteProperty(LANGUAGE_PROPERTY);
        else properties.setProperty(LANGUAGE_PROPERTY, previous);
        if (heading) heading.setValues(previousHeading);
      } catch (rollbackError) {
        throw new Error('No se pudo guardar el par de idiomas y la recuperación automática falló. Actualizá los datos antes de continuar.');
      }
      throw error;
    }
    return language;
  });
}

function ensurePhraseColumns_(sheet) {
  const columns = sheet.getMaxColumns();
  if (columns < WIDTH) sheet.insertColumnsAfter(columns, WIDTH - columns);
  return sheet;
}

function getSheet_(ss) {
  ss = ss || getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return buildSheet_(ss.insertSheet(SHEET_NAME));
  return ensurePhraseColumns_(sheet);
}

function getCollectionsSheet_(ss) {
  ss = ss || getSpreadsheet_();
  const sheet = ss.getSheetByName(COLLECTION_SHEET_NAME);
  return sheet || buildCollectionsSheet_(ss.insertSheet(COLLECTION_SHEET_NAME));
}

function getCollectionMembersSheet_(ss) {
  ss = ss || getSpreadsheet_();
  const sheet = ss.getSheetByName(COLLECTION_MEMBER_SHEET_NAME);
  return sheet || buildCollectionMembersSheet_(ss.insertSheet(COLLECTION_MEMBER_SHEET_NAME));
}

/** Ruta fría: encabezados, anchos, validación y colores. Sólo desde el menú. */
function setupSheet() {
  registerSpreadsheet_();
  const ss = getSpreadsheet_();
  buildSheet_(ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME));
  buildCollectionsSheet_(ss.getSheetByName(COLLECTION_SHEET_NAME) || ss.insertSheet(COLLECTION_SHEET_NAME));
  buildCollectionMembersSheet_(ss.getSheetByName(COLLECTION_MEMBER_SHEET_NAME) || ss.insertSheet(COLLECTION_MEMBER_SHEET_NAME));
  ss.toast('Hojas de frases y colecciones listas.', 'Frases', 5);
}

function buildSheet_(sheet) {
  ensurePhraseColumns_(sheet);
  sheet.getRange(1, 1, 1, WIDTH)
    .setValues([[HEADERS[0], 'Frase (' + targetLanguage_().locale.split('-')[0].toUpperCase() + ')',
      'Traducción (' + targetLanguage_().translation.locale.split('-')[0].toUpperCase() + ')'].concat(HEADERS.slice(3))])
    .setFontWeight('bold')
    .setBackground('#16202b')
    .setFontColor('#ffffff')
    .setVerticalAlignment('middle');

  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 32);

  [80, 300, 300, 220, 110, 180, 140, 140, 150, 260, 260].forEach(function (width, i) {
    sheet.setColumnWidth(i + 1, width);
  });

  const body = sheet.getMaxRows() - 1;
  if (body > 0) {
    // La validación cubre toda la columna, así las altas nuevas no
    // necesitan formato fila por fila.
    sheet.getRange(2, COL.STATUS, body, 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(STATUSES, true)
        .setAllowInvalid(false)
        .setHelpText('Estados válidos: ' + STATUSES.join(', ') + '.')
        .build()
    );

    sheet.getRange(2, COL.CREATED, body, 3).setNumberFormat('yyyy-mm-dd hh:mm');
    sheet.getRange(2, COL.DE, body, 3).setWrap(true).setVerticalAlignment('top');

    applyStatusColors_(sheet, body);
  }

  return sheet;
}

function buildCollectionsSheet_(sheet) {
  sheet.getRange(1, 1, 1, COLLECTION_WIDTH)
    .setValues([COLLECTION_HEADERS])
    .setFontWeight('bold')
    .setBackground('#16202b')
    .setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  [80, 260, 140, 140].forEach(function (width, i) { sheet.setColumnWidth(i + 1, width); });
  sheet.getRange(2, COLLECTION_COL.CREATED, Math.max(sheet.getMaxRows() - 1, 1), 2)
    .setNumberFormat('yyyy-mm-dd hh:mm');
  return sheet;
}

function buildCollectionMembersSheet_(sheet) {
  sheet.getRange(1, 1, 1, COLLECTION_MEMBER_WIDTH)
    .setValues([COLLECTION_MEMBER_HEADERS])
    .setFontWeight('bold')
    .setBackground('#16202b')
    .setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  [100, 100, 90].forEach(function (width, i) { sheet.setColumnWidth(i + 1, width); });
  return sheet;
}

function applyStatusColors_(sheet, body) {
  const target = sheet.getRange(2, COL.STATUS, body, 1);
  const targetA1 = target.getA1Notation();

  const kept = sheet.getConditionalFormatRules().filter(function (rule) {
    return !rule.getRanges().some(function (range) {
      return range.getA1Notation() === targetA1;
    });
  });

  const mine = STATUSES.map(function (status) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(status)
      .setBackground(STATUS_COLOR[status])
      .setRanges([target])
      .build();
  });

  sheet.setConditionalFormatRules(kept.concat(mine));
}

/* ------------------------------------------------------------------ */
/* Tabla en memoria: una sola lectura por operación                    */
/* ------------------------------------------------------------------ */

function readTable_(sheet, width) {
  const tableWidth = width || WIDTH;
  const lastRow = sheet.getLastRow();
  const values = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, tableWidth).getValues()
    : [];
  return { sheet: sheet, values: values, lastRow: lastRow };
}

/** Índice de fila (1-based en la hoja) para un ID, o -1. */
function rowOf_(table, id) {
  const target = normalize_(id).toUpperCase();
  if (!target) return -1;

  for (let i = 0; i < table.values.length; i++) {
    if (normalize_(table.values[i][COL.ID - 1]).toUpperCase() === target) return i + 2;
  }
  return -1;
}

function lastIdNumber_(table) {
  const props = PropertiesService.getDocumentProperties();
  let last = Number(props.getProperty('LAST_ID') || 0);
  if (!isFinite(last) || last < 0) last = 0;

  table.values.forEach(function (row) {
    const match = /^F(\d+)$/i.exec(normalize_(row[COL.ID - 1]));
    if (match) last = Math.max(last, Number(match[1]));
  });

  return last;
}

function formatId_(number) {
  return ID_PREFIX + String(number).padStart(ID_PAD, '0');
}

/** Siguiente ID a partir de los valores ya leídos: cero llamadas extra. */
function nextId_(table) {
  const next = lastIdNumber_(table) + 1;
  PropertiesService.getDocumentProperties().setProperty('LAST_ID', String(next));
  return formatId_(next);
}

function duplicateOf_(table, de, ignoreId) {
  const key = normalizeKey_(de);
  const ignore = normalize_(ignoreId).toUpperCase();

  for (let i = 0; i < table.values.length; i++) {
    const row = table.values[i];
    const rowId = normalize_(row[COL.ID - 1]);
    if (ignore && rowId.toUpperCase() === ignore) continue;
    if (normalizeKey_(row[COL.DE - 1]) === key) return rowId;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

function normalize_(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeKey_(value) {
  return normalize_(value).toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?¡¿"'`´]/g, '');
}

function cleanStatus_(value) {
  const candidate = normalize_(value).toLowerCase();
  for (let i = 0; i < STATUSES.length; i++) {
    if (STATUSES[i].toLowerCase() === candidate) return STATUSES[i];
  }
  return DEFAULT_STATUS;
}

function cleanTags_(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value == null ? '' : value).split(',');

  const seen = {};
  const out = [];

  raw.forEach(function (item) {
    const tag = normalize_(item).replace(/\s+/g, ' ');
    if (!tag) return;
    const key = tag.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    out.push(tag);
  });

  return out;
}

function rowToObject_(row) {
  return {
    id: normalize_(row[COL.ID - 1]),
    de: normalize_(row[COL.DE - 1]),
    es: normalize_(row[COL.ES - 1]),
    notes: normalize_(row[COL.NOTES - 1]),
    status: cleanStatus_(row[COL.STATUS - 1]),
    tags: cleanTags_(row[COL.TAGS - 1]),
    created: toIso_(row[COL.CREATED - 1]),
    updated: toIso_(row[COL.UPDATED - 1]),
    printedAt: toIso_(row[COL.PRINTED_AT - 1]),
    pronunciation: normalize_(row[COL.PRONUNCIATION - 1]),
    kana: normalize_(row[COL.KANA - 1])
  };
}

function toIso_(value) {
  return value instanceof Date ? value.toISOString() : '';
}

function withLock_(callback) {
  // La web app no tiene contexto de documento; todas las escrituras comparten este lock.
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* Colecciones                                                        */
/* ------------------------------------------------------------------ */

function collectionIdKey_(value) {
  return normalize_(value).toUpperCase();
}

function collectionNameKey_(value) {
  return normalize_(value).toLowerCase().replace(/\s+/g, ' ');
}

function isReservedCollectionName_(value) {
  return collectionNameKey_(value) === collectionNameKey_(ALL_COLLECTION_NAME);
}

function isUnassignedCollection_(id) {
  return collectionIdKey_(id) === collectionIdKey_(UNASSIGNED_COLLECTION_ID);
}

function collectionRows_(table) {
  const items = [];
  const byId = {};

  table.values.forEach(function (row, index) {
    const id = normalize_(row[COLLECTION_COL.ID - 1]);
    const name = normalize_(row[COLLECTION_COL.NAME - 1]);
    const key = collectionIdKey_(id);
    if (!id || !name || byId[key]) return;

    const item = {
      id: id,
      name: name,
      created: toIso_(row[COLLECTION_COL.CREATED - 1]),
      updated: toIso_(row[COLLECTION_COL.UPDATED - 1]),
      rowIndex: index + 2
    };
    byId[key] = item;
    items.push(item);
  });

  return { items: items, byId: byId };
}

function phraseRows_(table) {
  const items = [];
  const byId = {};

  table.values.forEach(function (row) {
    const item = rowToObject_(row);
    const key = collectionIdKey_(item.id);
    if (!item.id || !item.de || byId[key]) return;
    byId[key] = item;
    items.push(item);
  });

  return { items: items, byId: byId };
}

/** Sólo conserva asociaciones que apuntan a frases y colecciones reales. */
function membershipRows_(collections, members, phrases) {
  const rows = [];
  const byPhrase = {};
  const seen = {};

  members.values.forEach(function (row, index) {
    const collectionKey = collectionIdKey_(row[COLLECTION_MEMBER_COL.COLLECTION_ID - 1]);
    const phraseKey = collectionIdKey_(row[COLLECTION_MEMBER_COL.PHRASE_ID - 1]);
    const pairKey = collectionKey + '|' + phraseKey;
    if (!collections.byId[collectionKey] || !phrases.byId[phraseKey] || seen[pairKey]) return;

    seen[pairKey] = true;
    const position = Number(row[COLLECTION_MEMBER_COL.POSITION - 1]);
    const entry = {
      collectionKey: collectionKey,
      phraseKey: phraseKey,
      position: isFinite(position) && position > 0 ? position : Number.MAX_SAFE_INTEGER,
      sourceIndex: index
    };
    rows.push(entry);
    if (!byPhrase[phraseKey]) byPhrase[phraseKey] = [];
    byPhrase[phraseKey].push(collectionKey);
  });

  return { rows: rows, byPhrase: byPhrase };
}

function collectionIdNumber_(table) {
  const props = PropertiesService.getDocumentProperties();
  let last = Number(props.getProperty('LAST_COLLECTION_ID') || 0);
  if (!isFinite(last) || last < 0) last = 0;

  table.values.forEach(function (row) {
    const match = /^C(\d+)$/i.exec(normalize_(row[COLLECTION_COL.ID - 1]));
    if (match) last = Math.max(last, Number(match[1]));
  });
  return last;
}

function nextCollectionId_(table) {
  const next = collectionIdNumber_(table) + 1;
  PropertiesService.getDocumentProperties().setProperty('LAST_COLLECTION_ID', String(next));
  return COLLECTION_ID_PREFIX + String(next).padStart(ID_PAD, '0');
}

function collectionData_(ss) {
  ss = ss || getSpreadsheet_();
  const phraseTable = readTable_(getSheet_(ss));
  const collectionTable = readTable_(getCollectionsSheet_(ss), COLLECTION_WIDTH);
  const memberTable = readTable_(getCollectionMembersSheet_(ss), COLLECTION_MEMBER_WIDTH);
  const phrases = phraseRows_(phraseTable);
  const collections = collectionRows_(collectionTable);
  const memberships = membershipRows_(collections, memberTable, phrases);
  return {
    phraseTable: phraseTable,
    collectionTable: collectionTable,
    memberTable: memberTable,
    phrases: phrases,
    collections: collections,
    memberships: memberships
  };
}

function publicCollection_(item, count, unassigned) {
  return {
    id: item.id,
    name: item.name,
    count: count || 0,
    unassigned: !!unassigned
  };
}

/** La única carga de datos para la UI. */
function loadAppData() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty(SPREADSHEET_ID_PROPERTY) && typeof PRODUCTION_SPREADSHEET_ID !== 'string') return { setup: 'sheet' };
  if (!properties.getProperty(LANGUAGE_PROPERTY) && typeof PRODUCTION_SPREADSHEET_ID !== 'string') return { setup: 'language', language: targetLanguage_() };
  const ss = getSpreadsheet_();
  const data = collectionData_(ss);
  const counts = {};
  const assigned = {};
  const memberIdsByCollection = {};

  data.memberships.rows.forEach(function (member) {
    counts[member.collectionKey] = (counts[member.collectionKey] || 0) + 1;
    assigned[member.phraseKey] = true;
    if (!memberIdsByCollection[member.collectionKey]) memberIdsByCollection[member.collectionKey] = [];
    memberIdsByCollection[member.collectionKey].push(member);
  });

  const unassignedCount = data.phrases.items.filter(function (phrase) {
    return !assigned[collectionIdKey_(phrase.id)];
  }).length;
  const collections = data.collections.items.map(function (collection) {
    return publicCollection_(collection, counts[collectionIdKey_(collection.id)] || 0, false);
  }).sort(function (a, b) { return a.name.localeCompare(b.name); });

  Object.keys(memberIdsByCollection).forEach(function (key) {
    memberIdsByCollection[key].sort(function (a, b) {
      return a.position - b.position || a.sourceIndex - b.sourceIndex;
    });
    memberIdsByCollection[key] = memberIdsByCollection[key].map(function (member) {
      return data.phrases.byId[member.phraseKey].id;
    });
  });

  return {
    language: targetLanguage_(),
    items: data.phrases.items.sort(function (a, b) { return b.id.localeCompare(a.id); }),
    collections: [{ id: UNASSIGNED_COLLECTION_ID, name: 'Sin colección', count: unassignedCount, unassigned: true }]
      .concat(collections),
    memberIdsByCollection: memberIdsByCollection
  };
}

function clearCollectionMembers_(sheet, table, predicate) {
  const ranges = [];
  table.values.forEach(function (row, index) {
    if (predicate(row)) ranges.push('A' + (index + 2) + ':C' + (index + 2));
  });
  if (ranges.length) sheet.getRangeList(ranges).clearContent();
}

function requestedCollectionIds_(value, collections) {
  const raw = Array.isArray(value) ? value : [];
  const seen = {};
  const ids = [];

  raw.forEach(function (value) {
    const key = collectionIdKey_(value);
    if (!key || seen[key]) return;
    if (isUnassignedCollection_(key) || !collections.byId[key]) {
      throw new Error('Elegí sólo colecciones existentes.');
    }
    seen[key] = true;
    ids.push(collections.byId[key].id);
  });
  return ids;
}

function syncPhraseCollections_(sheet, table, collections, phraseId, collectionIds) {
  const phraseKey = collectionIdKey_(phraseId);
  const selected = {};
  const nextPosition = {};
  const current = {};

  collectionIds.forEach(function (id) { selected[collectionIdKey_(id)] = id; });
  table.values.forEach(function (row) {
    const collectionKey = collectionIdKey_(row[COLLECTION_MEMBER_COL.COLLECTION_ID - 1]);
    const rowPhraseKey = collectionIdKey_(row[COLLECTION_MEMBER_COL.PHRASE_ID - 1]);
    if (!collections.byId[collectionKey]) return;
    const position = Number(row[COLLECTION_MEMBER_COL.POSITION - 1]);
    nextPosition[collectionKey] = Math.max(nextPosition[collectionKey] || 0, isFinite(position) && position > 0 ? position : 0);
    if (rowPhraseKey === phraseKey) current[collectionKey] = true;
  });

  clearCollectionMembers_(sheet, table, function (row) {
    const collectionKey = collectionIdKey_(row[COLLECTION_MEMBER_COL.COLLECTION_ID - 1]);
    return collectionIdKey_(row[COLLECTION_MEMBER_COL.PHRASE_ID - 1]) === phraseKey && !selected[collectionKey];
  });

  const additions = collectionIds.filter(function (id) {
    return !current[collectionIdKey_(id)];
  }).map(function (id) {
    const key = collectionIdKey_(id);
    nextPosition[key] = (nextPosition[key] || 0) + 1;
    return [id, phraseId, nextPosition[key]];
  });
  if (additions.length) {
    sheet.getRange(table.lastRow + 1, 1, additions.length, COLLECTION_MEMBER_WIDTH).setValues(additions);
  }
  return collectionIds;
}

function createCollection(payload) {
  const name = normalize_(payload && payload.name);
  if (!name) throw new Error('La colección necesita un nombre.');
  if (isReservedCollectionName_(name)) throw new Error('El nombre "Todas" está reservado.');

  return withLock_(function () {
    const sheet = getCollectionsSheet_(getSpreadsheet_());
    const table = readTable_(sheet, COLLECTION_WIDTH);
    const key = collectionNameKey_(name);
    const duplicate = collectionRows_(table).items.some(function (collection) {
      return collectionNameKey_(collection.name) === key;
    });
    if (duplicate) throw new Error('Ya existe una colección con ese nombre.');

    const now = new Date();
    const row = [nextCollectionId_(table), name, now, now];
    sheet.getRange(table.lastRow + 1, 1, 1, COLLECTION_WIDTH).setValues([row]);
    return publicCollection_({ id: row[0], name: row[1] }, 0, false);
  });
}

function renameCollection(payload) {
  const id = normalize_(payload && payload.id);
  const name = normalize_(payload && payload.name);
  if (!id || isUnassignedCollection_(id)) throw new Error('Elegí una colección válida.');
  if (!name) throw new Error('La colección necesita un nombre.');
  if (isReservedCollectionName_(name)) throw new Error('El nombre "Todas" está reservado.');

  return withLock_(function () {
    const sheet = getCollectionsSheet_(getSpreadsheet_());
    const table = readTable_(sheet, COLLECTION_WIDTH);
    const collections = collectionRows_(table);
    const collection = collections.byId[collectionIdKey_(id)];
    if (!collection) throw new Error('No existe la colección ' + id + '.');

    const key = collectionNameKey_(name);
    const duplicate = collections.items.some(function (item) {
      return item.id !== collection.id && collectionNameKey_(item.name) === key;
    });
    if (duplicate) throw new Error('Ya existe una colección con ese nombre.');

    sheet.getRange(collection.rowIndex, 1, 1, COLLECTION_WIDTH)
      .setValues([[collection.id, name, table.values[collection.rowIndex - 2][COLLECTION_COL.CREATED - 1] || new Date(), new Date()]]);
    return publicCollection_({ id: collection.id, name: name }, 0, false);
  });
}

function deleteCollection(id) {
  const collectionId = normalize_(id);
  if (!collectionId || isUnassignedCollection_(collectionId)) throw new Error('No se puede borrar esa colección.');

  return withLock_(function () {
    const ss = getSpreadsheet_();
    const sheet = getCollectionsSheet_(ss);
    const table = readTable_(sheet, COLLECTION_WIDTH);
    const collection = collectionRows_(table).byId[collectionIdKey_(collectionId)];
    if (!collection) throw new Error('No existe la colección ' + collectionId + '.');

    const memberSheet = getCollectionMembersSheet_(ss);
    const members = readTable_(memberSheet, COLLECTION_MEMBER_WIDTH);
    clearCollectionMembers_(memberSheet, members, function (row) {
      return collectionIdKey_(row[COLLECTION_MEMBER_COL.COLLECTION_ID - 1]) === collectionIdKey_(collection.id);
    });
    sheet.deleteRow(collection.rowIndex);
    return { id: collection.id };
  });
}

function removePhraseFromCollections_(phraseId, ss) {
  const sheet = getCollectionMembersSheet_(ss);
  const table = readTable_(sheet, COLLECTION_MEMBER_WIDTH);
  const target = collectionIdKey_(phraseId);
  clearCollectionMembers_(sheet, table, function (row) {
    return collectionIdKey_(row[COLLECTION_MEMBER_COL.PHRASE_ID - 1]) === target;
  });
}

function shuffleItems_(items) {
  const shuffled = items.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const item = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = item;
  }
  return shuffled;
}

function requestedPrintCollectionIds_(value, collections) {
  const raw = Array.isArray(value) ? value : [];
  const seen = {};
  const ids = [];

  raw.forEach(function (value) {
    const key = collectionIdKey_(value);
    if (!key || seen[key]) return;
    if (isUnassignedCollection_(key)) {
      seen[key] = true;
      ids.push(UNASSIGNED_COLLECTION_ID);
      return;
    }
    if (!collections.byId[key]) throw new Error('Elegí sólo colecciones existentes.');
    seen[key] = true;
    ids.push(collections.byId[key].id);
  });
  if (!ids.length) throw new Error('Elegí al menos una colección.');
  return ids;
}

function printPlan_(data, payload) {
  const scope = normalize_(payload && payload.scope);
  const order = normalize_(payload && payload.order) || 'manual';
  const onlyUnprinted = payload && typeof payload.onlyUnprinted === 'boolean' ? payload.onlyUnprinted : false;
  if (scope !== ALL_PRINT_SCOPE && scope !== COLLECTION_PRINT_SCOPE) {
    throw new Error('Elegí todas las frases o una colección.');
  }
  if (order !== 'manual' && order !== 'random') throw new Error('Elegí un orden válido.');

  const visible = function (item) { return !onlyUnprinted || !item.printedAt; };
  const arrange = function (items) {
    const filtered = items.filter(visible);
    return order === 'random' ? shuffleItems_(filtered) : filtered;
  };
  const groups = [];

  if (scope === ALL_PRINT_SCOPE) {
    const items = data.phrases.items.slice().sort(function (a, b) { return b.id.localeCompare(a.id); });
    const arranged = arrange(items);
    if (arranged.length) groups.push({ id: '__all__', name: 'Todas las frases', items: arranged });
  } else {
    const collectionIds = requestedPrintCollectionIds_(payload && payload.collectionIds, data.collections);
    const membersByCollection = {};
    const assigned = {};
    data.memberships.rows.forEach(function (member) {
      if (!membersByCollection[member.collectionKey]) membersByCollection[member.collectionKey] = [];
      membersByCollection[member.collectionKey].push(member);
      assigned[member.phraseKey] = true;
    });

    collectionIds.forEach(function (id) {
      const unassigned = isUnassignedCollection_(id);
      const collection = unassigned
        ? { id: UNASSIGNED_COLLECTION_ID, name: 'Sin colección' }
        : data.collections.byId[collectionIdKey_(id)];
      let items;

      if (unassigned) {
        items = data.phrases.items.filter(function (item) {
          return !assigned[collectionIdKey_(item.id)];
        }).sort(function (a, b) { return b.id.localeCompare(a.id); });
      } else {
        items = (membersByCollection[collectionIdKey_(id)] || []).slice()
          .sort(function (a, b) { return a.position - b.position || a.sourceIndex - b.sourceIndex; })
          .map(function (member) { return data.phrases.byId[member.phraseKey]; })
          .filter(Boolean);
      }

      const arranged = arrange(items);
      if (arranged.length) groups.push({ id: collection.id, name: collection.name, items: arranged });
    });
  }

  const phraseIds = [];
  const seen = {};
  groups.forEach(function (group) {
    group.items.forEach(function (item) {
      const key = collectionIdKey_(item.id);
      if (!seen[key]) {
        seen[key] = true;
        phraseIds.push(item.id);
      }
    });
  });
  if (!phraseIds.length) {
    throw new Error(onlyUnprinted ? 'No hay frases no incluidas para generar.' : 'No hay frases para generar.');
  }
  const rowCount = groups.reduce(function (count, group) { return count + group.items.length; }, 0);
  const plan = { scope: scope, order: order, groups: groups, phraseIds: phraseIds, count: phraseIds.length, rowCount: rowCount };
  plan.signature = printPlanSignature_(plan);
  return plan;
}

function printPlanSignature_(plan) {
  return JSON.stringify(plan.groups.map(function (group) {
    const items = group.items.map(function (item) { return [item.id, item.de, item.es, item.pronunciation, item.kana]; });
    if (plan.order === 'random') items.sort(function (a, b) { return a[0].localeCompare(b[0]); });
    return [group.id, group.name, items];
  }));
}

function printMarkdownCell_(value) {
  return normalize_(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n|\r/g, '<br>');
}

function pronunciationParts_(item, japanese) {
  return (japanese ? [item.kana, item.pronunciation] : [item.pronunciation])
    .map(normalize_).filter(Boolean);
}

function printHasPronunciation_(plan, japanese) {
  return plan.groups.some(function (group) {
    return group.items.some(function (item) { return pronunciationParts_(item, japanese).length > 0; });
  });
}

function translationHeading_() {
  const name = targetLanguage_().translation.name;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function printMarkdown_(plan, now) {
  const heading = languageHeading_();
  const japanese = targetLanguage_().locale.split('-')[0] === 'ja';
  const translationHeading = translationHeading_();
  const pronunciation = printHasPronunciation_(plan, japanese);
  const lines = [
    '# ' + heading + ' – Frases para estudiar',
    '',
    'Generado el ' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') + ' · ' + plan.count + ' frases distintas' +
      (plan.rowCount !== plan.count ? ' · ' + plan.rowCount + ' filas' : ''),
    ''
  ];
  plan.groups.forEach(function (group) {
    lines.push('## ' + printMarkdownCell_(group.name), '', '| ' + printMarkdownCell_(heading) +
      (pronunciation ? ' | Pronunciación' : '') + ' | ' + printMarkdownCell_(translationHeading) + ' |',
      pronunciation ? '| --- | --- | --- |' : '| --- | --- |');
    group.items.forEach(function (item) {
      lines.push('| ' + printMarkdownCell_(item.de) + (pronunciation ? ' | ' + pronunciationParts_(item, japanese).map(printMarkdownCell_).join('<br>') : '') + ' | ' + printMarkdownCell_(item.es) + ' |');
    });
    lines.push('');
  });
  return lines.join('\n');
}

function printHtmlCell_(value) {
  return normalize_(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r?\n|\r/g, '<br>');
}

function printHtmlBody_(plan, now) {
  const heading = languageHeading_();
  const language = targetLanguage_();
  const japanese = language.locale.split('-')[0] === 'ja';
  const translationHeading = translationHeading_();
  const pronunciation = printHasPronunciation_(plan, japanese);
  const translationLocale = language.translation.locale;
  const locale = language.locale;
  const lines = [
    '<h1>' + printHtmlCell_(heading) + ' – Frases para estudiar</h1>',
    '<p class="material-meta">Generado el ' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') + ' · ' + plan.count + ' frases distintas' +
      (plan.rowCount !== plan.count ? ' · ' + plan.rowCount + ' filas' : '') + '</p>'
  ];
  plan.groups.forEach(function (group) {
    lines.push('<section><h2>' + printHtmlCell_(group.name) + '</h2><table><thead><tr><th>' + printHtmlCell_(heading) + '</th>' + (pronunciation ? '<th data-print-pronunciation>Pronunciación</th>' : '') + '<th>' + printHtmlCell_(translationHeading) + '</th></tr></thead><tbody>');
    group.items.forEach(function (item) {
      const aids = (japanese ? ['kana', 'pronunciation'] : ['pronunciation']).map(function (field) {
        const label = field === 'kana' ? 'Kanji con furigana' : japanese ? 'Romaji' : 'Romanización';
        return '<span data-pronunciation-field="' + field + '" data-phrase-id="' + printHtmlCell_(item.id) +
          '" data-placeholder="' + label + ' (opcional)" role="textbox" aria-label="' + label + ' de ' + printHtmlCell_(item.id) + '">' + printHtmlCell_(item[field]) + '</span>';
      }).join('');
      lines.push('<tr data-phrase-id="' + printHtmlCell_(item.id) + '"><td lang="' + printHtmlCell_(locale) + '">' + printHtmlCell_(item.de) + '</td>' +
        (pronunciation ? '<td data-print-pronunciation>' + aids + '</td>' : '') + '<td lang="' + printHtmlCell_(translationLocale) + '">' + printHtmlCell_(item.es) + '</td></tr>');
    });
    lines.push('</tbody></table></section>');
  });
  return lines.join('');
}

function printHtmlDocument_(body, fontSize, lineHeight) {
  const size = [18, 20, 22, 24].indexOf(Number(fontSize)) !== -1 ? Number(fontSize) : 20;
  const leading = [1.4, 1.6, 1.8, 2].indexOf(Number(lineHeight)) !== -1 ? Number(lineHeight) : 1.6;
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + printHtmlCell_(languageHeading_()) + ' – Material</title><style>' +
    '*,*::before,*::after{box-sizing:border-box}body{max-width:900px;margin:0 auto;padding:28px 24px;color:#111;font-family:Georgia,"Times New Roman",serif;font-size:' + size + 'px;line-height:' + leading + '}h1{margin:0 0 .25em;font-size:1.45em;line-height:1.15}h2{margin:1.5em 0 .45em;font-size:1.1em;line-height:1.2;break-after:avoid;page-break-after:avoid}.material-meta{margin:0 0 1.5em;color:#555;font: .65em/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 1.4em}th,td{border:1px solid #777;padding:.65em .6em;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#eee;font:.72em/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-transform:uppercase;letter-spacing:.04em}tr{break-inside:avoid;page-break-inside:avoid}[data-pronunciation-field]{display:block;white-space:pre-wrap}section{break-inside:auto;page-break-inside:auto}@media print{body{max-width:none;padding:12mm 10mm}h2{break-before:page;page-break-before:always}section:first-of-type h2{break-before:auto;page-break-before:auto}}' +
    '</style></head><body>' + body + '</body></html>';
}

function printFileName_(now) {
  return languageHeading_() + ' - Material - ' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH-mm') + '.md';
}

function printHtmlFileName_(now) {
  return languageHeading_() + ' - Material - ' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH-mm') + '.html';
}

function markPhrasesPrinted_(table, phraseIds, now) {
  if (!table.values.length) return;
  const included = {};
  phraseIds.forEach(function (id) { included[collectionIdKey_(id)] = true; });
  const columns = table.values.map(function (row) {
    const isIncluded = included[collectionIdKey_(row[COL.ID - 1])];
    return isIncluded ? [now, now] : [row[COL.UPDATED - 1], row[COL.PRINTED_AT - 1]];
  });
  table.sheet.getRange(2, COL.UPDATED, columns.length, 2).setValues(columns);
  table.values.forEach(function (row, index) {
    row[COL.UPDATED - 1] = columns[index][0];
    row[COL.PRINTED_AT - 1] = columns[index][1];
  });
}

function generatePhraseMarkdown(payload) {
  return withLock_(function () {
    assertLanguageVersion_(payload && payload.expectedLanguageVersion);
    const ss = getSpreadsheet_();
    const data = collectionData_(ss);
    const plan = printPlan_(data, payload);
    const now = new Date();
    const content = printMarkdown_(plan, now);
    markPhrasesPrinted_(data.phraseTable, plan.phraseIds, now);
    return {
      content: content,
      name: printFileName_(now),
      includedCount: plan.count,
      rowCount: plan.rowCount,
      markedAt: toIso_(now)
    };
  });
}

function printPronunciationSnapshot_(plan, table) {
  const included = new Set(plan.phraseIds.map(collectionIdKey_));
  return table.values.filter(function (row) { return included.has(collectionIdKey_(row[COL.ID - 1])); })
    .map(function (row) {
      const item = rowToObject_(row);
      return { id: item.id, pronunciation: item.pronunciation, kana: item.kana, updated: item.updated };
    });
}

/** Guarda sólo las ayudas editadas; conserva texto, traducción, progreso y colecciones. */
function saveMaterialPronunciations(payload) {
  if (!payload || !Array.isArray(payload.edits) || !payload.edits.length || typeof payload.previewSignature !== 'string' || !payload.previewSignature) {
    throw new Error('Previsualizá el material antes de guardar la pronunciación.');
  }
  return withLock_(function () {
    assertLanguageVersion_(payload.expectedLanguageVersion);
    const data = collectionData_(getSpreadsheet_());
    const plan = printPlan_(data, payload);
    if (payload.previewSignature !== plan.signature) throw new Error('Los datos cambiaron. Volvé a previsualizar el material antes de guardar.');
    const included = new Set(plan.phraseIds.map(collectionIdKey_));
    const seen = new Set();
    const rowIndices = new Map(data.phraseTable.values.map(function (row, index) { return [collectionIdKey_(row[COL.ID - 1]), index]; }));
    const changes = payload.edits.map(function (edit) {
      const key = collectionIdKey_(edit && edit.id);
      if (!included.has(key) || seen.has(key)) throw new Error('Elegí sólo frases distintas incluidas en la vista previa.');
      seen.add(key);
      const item = data.phrases.byId[key];
      if (typeof edit.expectedUpdated !== 'string' || edit.expectedUpdated !== item.updated) {
        throw new Error('La frase cambió en la planilla. Volvé a previsualizar el material antes de guardar.');
      }
      if (typeof edit.pronunciation !== 'string' || typeof edit.kana !== 'string') throw new Error('Completá las ayudas con texto.');
      const aids = pronunciationFields_(edit);
      return { item: item, aids: aids, rowIndex: rowIndices.get(key) };
    });
    const now = new Date();
    const changed = [];
    changes.forEach(function (change) {
      const row = data.phraseTable.values[change.rowIndex];
      if (normalize_(row[COL.PRONUNCIATION - 1]) === change.aids.pronunciation && normalize_(row[COL.KANA - 1]) === change.aids.kana) return;
      row[COL.PRONUNCIATION - 1] = change.aids.pronunciation;
      row[COL.KANA - 1] = change.aids.kana;
      row[COL.PRINTED_AT - 1] = '';
      row[COL.UPDATED - 1] = now;
      Object.assign(change.item, rowToObject_(row));
      changed.push(change.item);
    });
    if (changed.length) {
      data.phraseTable.sheet.getRange(2, COL.UPDATED, data.phraseTable.values.length, 4)
        .setValues(data.phraseTable.values.map(function (row) { return row.slice(COL.UPDATED - 1, COL.KANA); }));
    }
    return { items: changed, body: printHtmlBody_(plan, now), signature: printPlanSignature_(plan),
      phrases: printPronunciationSnapshot_(plan, data.phraseTable) };
  });
}

function previewPhraseMaterial(payload) {
  return withLock_(function () {
    assertLanguageVersion_(payload && payload.expectedLanguageVersion);
    const data = collectionData_(getSpreadsheet_());
    const plan = printPlan_(data, payload);
    const now = new Date();
    return {
      body: printHtmlBody_(plan, now),
      includedCount: plan.count,
      rowCount: plan.rowCount,
      name: printHtmlFileName_(now),
      signature: plan.signature,
      phrases: printPronunciationSnapshot_(plan, data.phraseTable)
    };
  });
}

function generatePhraseHtml(payload) {
  return withLock_(function () {
    assertLanguageVersion_(payload && payload.expectedLanguageVersion);
    const ss = getSpreadsheet_();
    const data = collectionData_(ss);
    const plan = printPlan_(data, payload);
    if (normalize_(payload && payload.previewSignature) && payload.previewSignature !== plan.signature) {
      throw new Error('Los datos cambiaron mientras se preparaba el material. Volvé a previsualizarlo.');
    }
    const now = new Date();
    const body = printHtmlBody_(plan, now);
    const content = printHtmlDocument_(body, payload && payload.fontSize, payload && payload.lineHeight);
    markPhrasesPrinted_(data.phraseTable, plan.phraseIds, now);
    return {
      content: content,
      body: body,
      name: printHtmlFileName_(now),
      includedCount: plan.count,
      rowCount: plan.rowCount,
      markedAt: toIso_(now),
      signature: plan.signature,
      phrases: printPronunciationSnapshot_(plan, data.phraseTable)
    };
  });
}

/* ------------------------------------------------------------------ */
/* Alta y edición de frases                                            */
/* ------------------------------------------------------------------ */

function assertPhraseCollectionVersion_(table, collections, phraseId, expectedIds) {
  const expected = requestedCollectionIds_(expectedIds, collections);
  const phraseKey = collectionIdKey_(phraseId);
  const seen = {};
  const current = [];

  table.values.forEach(function (row) {
    const collectionKey = collectionIdKey_(row[COLLECTION_MEMBER_COL.COLLECTION_ID - 1]);
    if (collectionIdKey_(row[COLLECTION_MEMBER_COL.PHRASE_ID - 1]) !== phraseKey || !collections.byId[collectionKey] || seen[collectionKey]) return;
    seen[collectionKey] = true;
    current.push(collections.byId[collectionKey].id);
  });

  if (expected.length !== current.length || expected.some(function (id) {
    return !seen[collectionIdKey_(id)];
  })) {
    throw new Error('Las colecciones de esta frase cambiaron. Actualizá los datos antes de guardar.');
  }
}

function restorePhraseMemberships_(sheet, originalTable, phraseId) {
  const phraseKey = collectionIdKey_(phraseId);
  const current = readTable_(sheet, COLLECTION_MEMBER_WIDTH);
  clearCollectionMembers_(sheet, current, function (row) {
    return collectionIdKey_(row[COLLECTION_MEMBER_COL.PHRASE_ID - 1]) === phraseKey;
  });
  originalTable.values.forEach(function (row, index) {
    if (collectionIdKey_(row[COLLECTION_MEMBER_COL.PHRASE_ID - 1]) !== phraseKey) return;
    sheet.getRange(index + 2, 1, 1, COLLECTION_MEMBER_WIDTH).setValues([row]);
  });
}

/** Guarda la frase y sus colecciones con un único lock. */
function phraseContentChanged_(row, de, es, pronunciation, kana) {
  return normalize_(row[COL.DE - 1]) !== de || normalize_(row[COL.ES - 1]) !== es ||
    normalize_(row[COL.PRONUNCIATION - 1]) !== normalize_(pronunciation) || normalize_(row[COL.KANA - 1]) !== normalize_(kana);
}

function pronunciationFields_(payload) {
  const fields = {};
  ['pronunciation', 'kana'].forEach(function (key) {
    if (payload[key] != null && typeof payload[key] !== 'string') throw new Error('La pronunciación y el furigana deben ser texto.');
    fields[key] = normalize_(payload[key]);
  });
  return fields;
}

function savePhrase(payload) {
  const id = normalize_(payload && payload.id);
  const de = normalize_(payload && payload.de);
  const es = normalize_(payload && payload.es);
  const aids = pronunciationFields_(payload || {});
  if (!de) throw new Error('La frase en ' + targetLanguage_().name + ' no puede quedar vacía.');

  return withLock_(function () {
    assertLanguageVersion_(payload && payload.expectedLanguageVersion);
    const ss = getSpreadsheet_();
    const sheet = getSheet_(ss);
    const table = readTable_(sheet);
    const collections = collectionRows_(readTable_(getCollectionsSheet_(ss), COLLECTION_WIDTH));
    const collectionIds = requestedCollectionIds_(payload && payload.collectionIds, collections);
    const memberSheet = getCollectionMembersSheet_(ss);
    const members = readTable_(memberSheet, COLLECTION_MEMBER_WIDTH);
    const now = new Date();
    let row;
    let rowIndex;
    let originalRow = null;

    if (id) {
      rowIndex = rowOf_(table, id);
      if (rowIndex === -1) throw new Error('No existe la frase ' + id + '.');
      const current = table.values[rowIndex - 2];
      assertPhraseVersion_(current, payload && payload.expectedUpdated);
      assertPhraseCollectionVersion_(members, collections, id, payload && payload.expectedCollectionIds);
      const duplicate = duplicateOf_(table, de, id);
      if (duplicate) throw new Error('Esa frase ya está cargada como ' + duplicate + '.');

      if (payload.pronunciation == null) aids.pronunciation = normalize_(current[COL.PRONUNCIATION - 1]);
      if (payload.kana == null) aids.kana = normalize_(current[COL.KANA - 1]);
      originalRow = current.slice();
      row = [
        id, de, es, normalize_(payload.notes), current[COL.STATUS - 1],
        cleanTags_(payload.tags).join(', '), current[COL.CREATED - 1] || now, now,
        phraseContentChanged_(current, de, es, aids.pronunciation, aids.kana) ? '' : current[COL.PRINTED_AT - 1] || '',
        aids.pronunciation, aids.kana
      ];
    } else {
      const duplicate = duplicateOf_(table, de, null);
      if (duplicate) throw new Error('Esa frase ya está cargada como ' + duplicate + '.');

      rowIndex = table.lastRow + 1 || 2;
      row = [
        nextId_(table), de, normalize_(payload.es), normalize_(payload.notes), cleanStatus_(payload.status),
        cleanTags_(payload.tags).join(', '), now, now, '', aids.pronunciation, aids.kana
      ];
    }

    let phraseWritten = false;
    try {
      sheet.getRange(rowIndex, 1, 1, WIDTH).setValues([row]);
      phraseWritten = true;
      return {
        item: rowToObject_(row),
        collectionIds: syncPhraseCollections_(memberSheet, members, collections, row[COL.ID - 1], collectionIds)
      };
    } catch (error) {
      if (!phraseWritten) throw error;
      try {
        if (originalRow) sheet.getRange(rowIndex, 1, 1, WIDTH).setValues([originalRow]);
        else sheet.getRange(rowIndex, 1, 1, WIDTH).clearContent();
        restorePhraseMemberships_(memberSheet, members, row[COL.ID - 1]);
      } catch (rollbackError) {
        throw new Error('No se pudo guardar y la recuperación automática falló. Actualizá los datos antes de continuar.');
      }
      throw error;
    }
  });
}

/** Agrega una tanda y sus asociaciones sin modificar frases existentes. */
function saveGeneratedPhrases(payload) {
  const items = payload && payload.items;
  if (!Array.isArray(items) || !items.length || items.length > 10 || items.some(function (item) {
    return !item || typeof item.de !== 'string' || typeof item.es !== 'string' || !item.de.trim() || !item.es.trim();
  })) throw new Error('Seleccioná entre 1 y 10 frases con ' + targetLanguage_().name + ' y ' + targetLanguage_().translation.name + ' completos.');
  return withLock_(function () {
    assertLanguageVersion_(payload && payload.expectedLanguageVersion);
    const ss = getSpreadsheet_();
    const phrases = readTable_(getSheet_(ss));
    const collections = collectionRows_(readTable_(getCollectionsSheet_(ss), COLLECTION_WIDTH));
    const collectionIds = requestedCollectionIds_(payload.collectionIds, collections);
    const members = readTable_(getCollectionMembersSheet_(ss), COLLECTION_MEMBER_WIDTH);
    const known = new Map();
    phrases.values.forEach(function (row) {
      if (normalize_(row[COL.ID - 1])) known.set(normalizeKey_(row[COL.DE - 1]), row);
    });
    const associations = new Set();
    const positions = new Map();
    members.values.forEach(function (row) {
      const key = collectionIdKey_(row[0]);
      associations.add(key + ':' + collectionIdKey_(row[1]));
      positions.set(key, Math.max(positions.get(key) || 0, Number(row[2]) || 0));
    });
    const additions = [];
    const links = [];
    const now = new Date();
    let lastId = lastIdNumber_(phrases);
    const results = items.map(function (item) {
      const aids = pronunciationFields_(item);
      const key = normalizeKey_(item.de);
      let row = known.get(key);
      const reused = !!row;
      if (!row) {
        row = [formatId_(++lastId), item.de.trim(), item.es.trim(), '', DEFAULT_STATUS, '', now, now, '', aids.pronunciation, aids.kana];
        known.set(key, row);
        additions.push(row);
      }
      collectionIds.forEach(function (id) {
        const collectionKey = collectionIdKey_(id);
        const association = collectionKey + ':' + collectionIdKey_(row[0]);
        if (associations.has(association)) return;
        const position = (positions.get(collectionKey) || 0) + 1;
        links.push([id, row[0], position]);
        positions.set(collectionKey, position);
        associations.add(association);
      });
      return { item: rowToObject_(row), reused: reused };
    });
    results.forEach(function (result) {
      result.collectionIds = collections.items.filter(function (collection) {
        return associations.has(collectionIdKey_(collection.id) + ':' + collectionIdKey_(result.item.id));
      }).map(function (collection) { return collection.id; });
    });
    let phraseRange;
    let memberRange;
    try {
      if (additions.length) {
        phraseRange = phrases.sheet.getRange(phrases.lastRow + 1, 1, additions.length, WIDTH);
        phraseRange.setValues(additions);
      }
      if (links.length) {
        memberRange = members.sheet.getRange(members.lastRow + 1, 1, links.length, COLLECTION_MEMBER_WIDTH);
        memberRange.setValues(links);
      }
      if (additions.length) PropertiesService.getDocumentProperties().setProperty('LAST_ID', String(lastId));
    } catch (error) {
      let recoveryFailed = false;
      [memberRange, phraseRange].forEach(function (range) {
        try { if (range) range.clearContent(); } catch (rollbackError) { recoveryFailed = true; }
      });
      if (recoveryFailed) throw new Error('No se pudo guardar y la recuperación automática falló. Actualizá los datos antes de continuar.');
      throw error;
    }
    return { results: results };
  });
}

function importDelimiter_(value) {
  if (value === ',' || value === '\t') return value;
  throw new Error('Elegí coma o tab como separador.');
}

function parseImport_(text, delimiter) {
  const source = String(text == null ? '' : text);
  if (!source.trim()) throw new Error('Pegá el CSV o TSV antes de continuar.');
  return Utilities.parseCsv(source, importDelimiter_(delimiter));
}

function columnCount_(rows) {
  return rows.reduce(function (count, row) {
    return Math.max(count, row.length);
  }, 0);
}

function previewImport(text, delimiter) {
  const rows = parseImport_(text, delimiter);
  return {
    columnCount: columnCount_(rows),
    rows: rows.slice(0, 5)
  };
}

function importPhrases(payload) {
  const rows = parseImport_(payload && payload.text, payload && payload.delimiter);
  const deColumn = Number(payload && payload.deColumn);
  const esColumn = Number(payload && payload.esColumn);
  const columnCount = columnCount_(rows);
  const firstRow = payload && payload.hasHeader ? 1 : 0;

  if (!Number.isInteger(deColumn) || !Number.isInteger(esColumn) || deColumn < 0 || esColumn < 0 ||
      deColumn >= columnCount || esColumn >= columnCount || deColumn === esColumn) {
    throw new Error('Elegí columnas distintas para ' + targetLanguage_().name + ' y ' + targetLanguage_().translation.name + '.');
  }

  const optionalColumns = ['pronunciationColumn', 'kanaColumn'].map(function (key) {
    return payload[key] == null || payload[key] === '' ? -1 : Number(payload[key]);
  });
  const selectedColumns = [deColumn, esColumn];
  optionalColumns.forEach(function (column) {
    if (!Number.isInteger(column) || column < -1 || column >= columnCount ||
        (column !== -1 && selectedColumns.indexOf(column) !== -1)) {
      throw new Error('Elegí columnas distintas y válidas para las ayudas de pronunciación.');
    }
    if (column !== -1) selectedColumns.push(column);
  });

  return withLock_(function () {
    assertLanguageVersion_(payload && payload.expectedLanguageVersion);
    const sheet = getSheet_();
    const table = readTable_(sheet);
    const known = {};
    let lastId = lastIdNumber_(table);
    let empty = 0;
    let duplicate = 0;
    const now = new Date();
    const additions = [];

    table.values.forEach(function (row) {
      const key = normalizeKey_(row[COL.DE - 1]);
      if (key) known[key] = true;
    });

    rows.slice(firstRow).forEach(function (source) {
      const de = normalize_(source[deColumn]);
      if (!de) {
        empty++;
        return;
      }

      const key = normalizeKey_(de);
      if (known[key]) {
        duplicate++;
        return;
      }

      known[key] = true;
      lastId++;
      additions.push([
        formatId_(lastId), de, normalize_(source[esColumn]), '', DEFAULT_STATUS, '', now, now, '',
        normalize_(source[optionalColumns[0]]), normalize_(source[optionalColumns[1]])
      ]);
    });

    if (additions.length) {
      sheet.getRange(table.lastRow + 1, 1, additions.length, WIDTH).setValues(additions);
      PropertiesService.getDocumentProperties().setProperty('LAST_ID', String(lastId));
    }

    return {
      imported: additions.length,
      empty: empty,
      duplicate: duplicate,
      items: additions.map(rowToObject_)
    };
  });
}

function assertPhraseVersion_(row, expectedUpdated) {
  const expected = normalize_(expectedUpdated);
  if (expected && expected !== toIso_(row[COL.UPDATED - 1])) {
    throw new Error('La frase cambió en la planilla. Actualizá los datos antes de guardar.');
  }
}

/** Cambia sólo el estado. Una lectura, una escritura de dos celdas. */
function setStatus(id, status, expectedUpdated) {
  return withLock_(function () {
    const sheet = getSheet_();
    const table = readTable_(sheet);

    const rowIndex = rowOf_(table, id);
    if (rowIndex === -1) throw new Error('No existe la frase ' + id + '.');

    const row = table.values[rowIndex - 2];
    assertPhraseVersion_(row, expectedUpdated);
    row[COL.STATUS - 1] = cleanStatus_(status);
    row[COL.UPDATED - 1] = new Date();

    sheet.getRange(rowIndex, 1, 1, WIDTH).setValues([row]);

    return rowToObject_(row);
  });
}

function setPhrasePrinted(payload) {
  const id = normalize_(payload && payload.id);
  const printed = payload && payload.printed;
  if (!id || typeof printed !== 'boolean') throw new Error('La marca de material es inválida.');

  return withLock_(function () {
    const sheet = getSheet_();
    const table = readTable_(sheet);
    const rowIndex = rowOf_(table, id);
    if (rowIndex === -1) throw new Error('No existe la frase ' + id + '.');

    const row = table.values[rowIndex - 2];
    assertPhraseVersion_(row, payload && payload.expectedUpdated);
    row[COL.PRINTED_AT - 1] = printed ? new Date() : '';
    row[COL.UPDATED - 1] = new Date();
    sheet.getRange(rowIndex, 1, 1, WIDTH).setValues([row]);
    return rowToObject_(row);
  });
}

/** Renombra una etiqueta en todas las frases: una lectura, una escritura. */
function renameTag(from, to) {
  const oldKey = normalize_(from).toLowerCase();
  if (!oldKey) throw new Error('Falta la etiqueta a renombrar.');
  const next = cleanTags_(to)[0] || '';

  return withLock_(function () {
    const sheet = getSheet_();
    const table = readTable_(sheet);
    if (!table.values.length) return { changed: 0 };

    let changed = 0;

    const column = table.values.map(function (row) {
      const tags = cleanTags_(row[COL.TAGS - 1]);
      const hit = tags.some(function (tag) { return tag.toLowerCase() === oldKey; });
      if (!hit) return [row[COL.TAGS - 1]];

      changed++;
      const replaced = tags.map(function (tag) {
        return tag.toLowerCase() === oldKey ? next : tag;
      });
      return [cleanTags_(replaced).join(', ')];
    });

    if (changed) {
      sheet.getRange(2, COL.TAGS, column.length, 1).setValues(column);
    }
    return { changed: changed };
  });
}

/* ------------------------------------------------------------------ */
/* Baja                                                                */
/* ------------------------------------------------------------------ */

function deletePhrase(payload) {
  const phraseId = normalize_(typeof payload === 'string' ? payload : payload && payload.id);
  const expectedUpdated = payload && typeof payload === 'object' ? payload.expectedUpdated : '';
  return withLock_(function () {
    const ss = getSpreadsheet_();
    const sheet = getSheet_(ss);
    const table = readTable_(sheet);

    const rowIndex = rowOf_(table, phraseId);
    if (rowIndex === -1) throw new Error('No existe la frase ' + phraseId + '.');
    assertPhraseVersion_(table.values[rowIndex - 2], expectedUpdated);

    removePhraseFromCollections_(phraseId, ss);
    sheet.deleteRow(rowIndex);
    return { id: phraseId };
  });
}

/* ------------------------------------------------------------------ */
/* Ediciones hechas directamente en la grilla                          */
/* ------------------------------------------------------------------ */

/**
 * Normaliza en bloque: lee el rango editado completo y lo devuelve de una,
 * así pegar cincuenta filas cuesta lo mismo que editar una celda.
 */
function onEdit(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;

  return withLock_(function () {
  const editFirstColumn = e.range.getColumn();
  const editLastColumn = editFirstColumn + e.range.getNumColumns() - 1;
  const contentEdited = (editFirstColumn <= COL.ES && editLastColumn >= COL.DE) ||
    (editFirstColumn <= COL.KANA && editLastColumn >= COL.PRONUNCIATION);

  const first = Math.max(e.range.getRow(), 2);
  const last = e.range.getRow() + e.range.getNumRows() - 1;
  if (last < 2) return;

  ensurePhraseColumns_(sheet);
  const count = last - first + 1;
  const range = sheet.getRange(first, 1, count, WIDTH);
  const values = range.getValues();

  // Máximo de ID existente, leído una sola vez.
  const props = PropertiesService.getDocumentProperties();
  let counter = Number(props.getProperty('LAST_ID') || 0);
  if (!isFinite(counter) || counter < 0) counter = 0;

  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, COL.ID, lastRow - 1, 1).getValues().forEach(function (row) {
      const match = /^F(\d+)$/i.exec(normalize_(row[0]));
      if (match) counter = Math.max(counter, Number(match[1]));
    });
  }

  const now = new Date();
  let touched = false;

  values.forEach(function (row) {
    if (!normalize_(row[COL.DE - 1])) return;

    if (!normalize_(row[COL.ID - 1])) {
      counter++;
      row[COL.ID - 1] = ID_PREFIX + String(counter).padStart(ID_PAD, '0');
      row[COL.CREATED - 1] = now;
    }

    if (!normalize_(row[COL.STATUS - 1])) row[COL.STATUS - 1] = DEFAULT_STATUS;

    row[COL.TAGS - 1] = cleanTags_(row[COL.TAGS - 1]).join(', ');
    if (contentEdited) row[COL.PRINTED_AT - 1] = '';
    row[COL.UPDATED - 1] = now;
    touched = true;
  });

  if (!touched) return;

  props.setProperty('LAST_ID', String(counter));
  range.setValues(values);
  });
}
