export function quoteIdentifier(id) {
  return String(id || '').replace(/[^a-zA-Z0-9_\.]/g, '');
}

export function literal(value) {
  if (value == null) return 'NULL';
  const trimmed = ('' + value).trim();
  if (/^\(.*\)$/.test(trimmed)) return trimmed;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return trimmed;
  if (/^'.*'$/.test(trimmed) || /^".*"$/.test(trimmed)) return trimmed;
  return '\'' + trimmed.replace(/'/g, "''") + '\'';
}

export function buildSingleSQL(state) {
  let baseTable = state.selectedTables[0];
  if (!baseTable && state.fields.length) {
    baseTable = state.fields[0].table;
  }
  if (!baseTable) return '-- Добавьте хотя бы одно поле или выберите таблицу';
  const fromTable = quoteIdentifier(baseTable);

  const selected = state.fields.filter(f => state.fields.find(x => x.table===f.table && x.name===f.name));
  const selectParts = selected.length > 0
    ? selected.map(f => {
        let expr = f.expression || `${f.table}.${f.name}`;
        
        // Проверяем, есть ли уже агрегатная функция в выражении
        const hasAggregateFunction = /^(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(expr);
        
        if (f.agg && !hasAggregateFunction) {
          // Если есть агрегация в поле, но нет в выражении, применяем её
          if (f.expression && f.expression !== `${f.table}.${f.name}`) {
            // Если есть кастомное выражение, оборачиваем его в агрегацию
            expr = f.agg + '(' + expr + ')';
          } else {
            // Если стандартное поле, используем table.field
            const fq = quoteIdentifier(f.table) + '.' + quoteIdentifier(f.name);
            expr = f.agg + '(' + fq + ')';
          }
        }
        // Если агрегатная функция уже есть в выражении, используем его как есть
        
        return f.alias ? (expr + ' AS ' + quoteIdentifier(f.alias)) : expr;
      })
    : ['*'];

  const joinParts = (state.joins || []).map(j => {
    if (!j.rightTable) return null;
    const type = j.type || 'INNER';
    const on = (j.on || []).filter(x => x.left && x.right).map(x => `${quoteIdentifier(x.left)} ${x.op || '='} ${quoteIdentifier(x.right)}`);
    const onStr = on.length ? (' ON ' + on.join(' AND ')) : '';
    return `${type} JOIN ${quoteIdentifier(j.rightTable)}${onStr}`;
  }).filter(Boolean);

  const whereParts = [];
  for (let i = 0; i < state.filters.length; i++) {
    const f = state.filters[i];
    if (!f.field || !f.op) continue;
    let part;
    const field = quoteIdentifier(f.field);
    const op = f.op.toUpperCase();
    if (op === 'IS NULL' || op === 'IS NOT NULL') {
      part = `${field} ${op}`;
    } else if (op === 'IN') {
      part = `${field} IN ${literal(f.value)}`;
    } else if (op === 'BETWEEN') {
      const [a,b] = ('' + (f.value || '')).split(',');
      part = `${field} BETWEEN ${literal(a)} AND ${literal(b)}`;
    } else if (op === 'LIKE') {
      part = `${field} LIKE ${literal(f.value)}`;
    } else {
      part = `${field} ${op} ${literal(f.value)}`;
    }
    if (part) {
      whereParts.push(part);
      const logic = (f.logic || 'AND').toUpperCase();
      if (i < state.filters.length - 1) whereParts.push(logic);
    }
  }

  const groupStr = state.groupBy.length ? ('\nGROUP BY ' + state.groupBy.map(quoteIdentifier).join(', ')) : '';
  const orderStr = state.orderBy.length ? ('\nORDER BY ' + state.orderBy.map(o => `${quoteIdentifier(o.field)} ${o.dir || 'ASC'}`).join(', ')) : '';
  const limitStr = (state.limit != null && state.limit !== '') ? ('\nLIMIT ' + Number(state.limit)) : '';
  const offsetStr = (state.offset != null && state.offset !== '') ? ('\nOFFSET ' + Number(state.offset)) : '';

  let sql = `SELECT\n  ${selectParts.join(',\n  ')}\nFROM ${fromTable}`;
  if (joinParts.length) sql += '\n' + joinParts.join('\n');
  if (whereParts.length) sql += '\nWHERE ' + whereParts.join(' ');
  sql += groupStr + orderStr + limitStr + offsetStr;

  return sql;
}

function buildCTESQL(cte) {
  // CTE теперь содержит массив подзапросов для UNION
  const cteQueries = cte.queries || [];
  if (cteQueries.length === 0) return '';
  
  const queryParts = [];
  for (let i = 0; i < cteQueries.length; i++) {
    const q = cteQueries[i];
    const sql = buildSingleSQL(q);
    if (i === 0) queryParts.push(sql);
    else queryParts.push(`${q.unionAllNext ? 'UNION ALL' : 'UNION'}\n${sql}`);
  }
  
  return queryParts.join('\n');
}

export function buildSQLFromQueries(queries, ctes = []) {
  const parts = [];
  
  // Добавляем CTE в начало если они есть
  if (ctes && ctes.length > 0) {
    const cteParts = ctes.map(cte => {
      const cteSQL = buildCTESQL(cte);
      return `${cte.name} AS (\n${cteSQL.split('\n').map(line => '  ' + line).join('\n')}\n)`;
    });
    parts.push(`WITH ${cteParts.join(',\n')}\n`);
  }
  
  // Добавляем основные запросы
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const sql = buildSingleSQL(q);
    if (i === 0) parts.push(sql);
    else parts.push(`\n${q.unionAllNext ? 'UNION ALL' : 'UNION'}\n${sql}`);
  }
  
  return parts.join('');
}


