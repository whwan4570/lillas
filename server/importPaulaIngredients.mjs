import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from './dbStore.mjs';
import { canonicalIngredientName, normalizeIngredientKey } from './ingredientNormalization.mjs';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  row.push(field);
  if (row.length > 1 || row[0].trim()) rows.push(row);
  return rows;
}

function toCanonical(rawName) {
  const canonical = canonicalIngredientName(rawName);
  if (canonical) return canonical;
  return normalizeIngredientKey(rawName);
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('Usage: node server/importPaulaIngredients.mjs <csvPath>');
  }

  const resolved = path.resolve(inputPath);
  const csvText = await fs.readFile(resolved, 'utf8');
  const rows = parseCsv(csvText);
  if (!rows.length) {
    throw new Error(`CSV appears empty: ${resolved}`);
  }

  const header = rows[0] ?? [];
  const ingredientIdx = header.findIndex((value) => String(value).trim() === 'ingredient_name');
  const categoryIdx = header.findIndex((value) => String(value).trim() === 'categories');
  if (ingredientIdx < 0) {
    throw new Error('Missing required "ingredient_name" column.');
  }

  const records = new Map();
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const rawName = String(row[ingredientIdx] ?? '').trim();
    if (!rawName) {
      skipped += 1;
      continue;
    }
    const canonicalName = toCanonical(rawName);
    if (!canonicalName) {
      skipped += 1;
      continue;
    }
    const categoryRaw = String(row[categoryIdx] ?? '').trim();
    const category = categoryRaw || null;
    const prev = records.get(canonicalName);
    if (!prev) {
      records.set(canonicalName, { canonicalName, rawName, category });
    } else if (!prev.category && category) {
      prev.category = category;
    }
  }

  const uniqueRecords = Array.from(records.values());
  const canonicalNames = uniqueRecords.map((item) => item.canonicalName);
  const chunkSize = 1000;
  const existingByCanonical = new Map();
  for (let i = 0; i < canonicalNames.length; i += chunkSize) {
    const chunk = canonicalNames.slice(i, i + chunkSize);
    const found = await prisma.ingredient.findMany({
      where: { canonicalName: { in: chunk } }
    });
    for (const row of found) existingByCanonical.set(row.canonicalName, row);
  }

  const toCreate = [];
  const toUpdate = [];
  for (const item of uniqueRecords) {
    const existing = existingByCanonical.get(item.canonicalName);
    if (!existing) {
      toCreate.push({
        canonicalName: item.canonicalName,
        inciName: item.rawName,
        aliasesJson: JSON.stringify([]),
        category: item.category
      });
      continue;
    }
    const nextInci = existing.inciName || item.rawName;
    const nextCategory = existing.category || item.category;
    if (nextInci !== existing.inciName || nextCategory !== existing.category) {
      toUpdate.push({
        canonicalName: item.canonicalName,
        inciName: nextInci,
        category: nextCategory
      });
    }
  }

  for (let i = 0; i < toCreate.length; i += chunkSize) {
    const chunk = toCreate.slice(i, i + chunkSize);
    await prisma.ingredient.createMany({
      data: chunk,
      skipDuplicates: true
    });
  }
  for (const item of toUpdate) {
    await prisma.ingredient.update({
      where: { canonicalName: item.canonicalName },
      data: {
        inciName: item.inciName,
        category: item.category
      }
    });
  }

  const processed = uniqueRecords.length;
  const created = toCreate.length;
  const updated = toUpdate.length;

  const total = await prisma.ingredient.count();
  console.log(
    JSON.stringify(
      {
        ok: true,
        file: resolved,
        processed,
        created,
        updated,
        skipped,
        totalIngredients: total
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
