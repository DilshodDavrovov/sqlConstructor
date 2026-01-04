// Продвинутый SQL парсер с поддержкой CTE, UNION, всех типов JOIN и условий

export function parseCompleteSQL(sqlText) {
  if (!sqlText || typeof sqlText !== 'string') {
    throw new Error('SQL текст должен быть строкой');
  }

  // Очищаем SQL от лишних пробелов и переносов, сохраняя структуру
  const cleanSQL = sqlText.trim().replace(/\s+/g, ' ');
  console.log('Очищенный SQL:', cleanSQL);
  
  const result = {
    ctes: [],
    queries: []
  };

  try {
    // Разделяем на CTE и основные запросы
    const { ctesPart, mainQueryPart } = separateCTEsFromMain(cleanSQL);
    console.log('CTE часть:', ctesPart);
    console.log('Основная часть:', mainQueryPart);
    
    // Парсим CTE если есть
    if (ctesPart) {
      result.ctes = parseCTEs(ctesPart);
      console.log('Парсированные CTE:', result.ctes);
    }
    
    // Парсим основные запросы (могут быть объединены UNION)
    if (mainQueryPart) {
      result.queries = parseMainQueries(mainQueryPart);
      console.log('Парсированные запросы:', result.queries);
    }
    
    return result;
  } catch (error) {
    console.error('Ошибка в parseCompleteSQL:', error);
    throw new Error(`Ошибка парсинга SQL: ${error.message}`);
  }
}

function separateCTEsFromMain(sql) {
  // Ищем WITH clause в начале запроса
  const withRegex = /^WITH\s+/i;
  
  if (!withRegex.test(sql)) {
    return { ctesPart: null, mainQueryPart: sql };
  }
  
  // Более точный поиск границы между CTE и основным запросом
  let depth = 0;
  let inQuotes = false;
  let quoteChar = '';
  let i = 5; // Начинаем после "WITH "
  
  // Пропускаем пробелы после WITH
  while (i < sql.length && /\s/.test(sql[i])) i++;
  
  // Ищем конец CTE блока
  while (i < sql.length) {
    const char = sql[i];
    const prevChar = i > 0 ? sql[i - 1] : '';
    
    // Обрабатываем кавычки
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
      }
    }
    
    if (!inQuotes) {
      if (char === '(') {
        depth++;
      } else if (char === ')') {
        depth--;
      } else if (depth === 0) {
        // Проверяем на SELECT вне скобок (начало основного запроса)
        const remaining = sql.substring(i);
        if (/^\s*SELECT\s+/i.test(remaining)) {
          const ctesPart = sql.substring(5, i).trim(); // 5 = "WITH ".length
          const mainQueryPart = remaining.trim();
          return { ctesPart, mainQueryPart };
        }
      }
    }
    
    i++;
  }
  
  // Если не нашли SELECT, возможно весь запрос - это CTE
  return { ctesPart: sql.substring(5).trim(), mainQueryPart: '' };
}

function parseCTEs(ctesText) {
  const ctes = [];
  
  // Разбиваем CTE по запятым (учитывая вложенные скобки)
  const cteDefinitions = splitCTEDefinitions(ctesText);
  
  cteDefinitions.forEach(cteDef => {
    const cte = parseSingleCTE(cteDef.trim());
    if (cte) {
      ctes.push(cte);
    }
  });
  
  return ctes;
}

function splitCTEDefinitions(text) {
  const definitions = [];
  let current = '';
  let parenthesesLevel = 0;
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const prevChar = i > 0 ? text[i - 1] : '';
    
    // Обрабатываем кавычки
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
      }
    }
    
    if (!inQuotes) {
      if (char === '(') {
        parenthesesLevel++;
      } else if (char === ')') {
        parenthesesLevel--;
      } else if (char === ',' && parenthesesLevel === 0) {
        definitions.push(current.trim());
        current = '';
        continue;
      }
    }
    
    current += char;
  }
  
  if (current.trim()) {
    definitions.push(current.trim());
  }
  
  return definitions;
}

function parseSingleCTE(cteText) {
  // Формат: cte_name AS (SELECT ... UNION SELECT ...)
  const cteMatch = cteText.match(/^(\w+)\s+AS\s+\((.+)\)$/i);
  if (!cteMatch) return null;
  
  const cteName = cteMatch[1];
  const cteBody = cteMatch[2];
  
  // Парсим подзапросы внутри CTE (могут быть объединены UNION)
  const queries = parseUnionQueries(cteBody);
  
  return {
    name: cteName,
    isCTE: true,
    queries: queries,
    currentQueryIndex: 0
  };
}

function parseMainQueries(mainQueryText) {
  // Основные запросы тоже могут быть объединены UNION
  return parseUnionQueries(mainQueryText);
}

function parseUnionQueries(queryText) {
  const queries = [];
  
  // Разбиваем по UNION (учитывая UNION ALL)
  const unionParts = splitByUnion(queryText);
  
  unionParts.forEach((part, index) => {
    const query = parseSelectQuery(part.query);
    if (query) {
      // Добавляем информацию о UNION
      query.unionAllNext = part.isUnionAll;
      query.name = `Запрос ${index + 1}`;
      queries.push(query);
    }
  });
  
  return queries;
}

function splitByUnion(text) {
  const parts = [];
  
  // Более точное разбиение с учетом скобок
  let currentQuery = '';
  let depth = 0;
  let inQuotes = false;
  let quoteChar = '';
  let i = 0;
  
  while (i < text.length) {
    const char = text[i];
    const prevChar = i > 0 ? text[i - 1] : '';
    
    // Обрабатываем кавычки
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
      }
    }
    
    if (!inQuotes) {
      if (char === '(') {
        depth++;
      } else if (char === ')') {
        depth--;
      } else if (depth === 0) {
        // Ищем UNION на верхнем уровне
        const remaining = text.substring(i);
        const unionMatch = remaining.match(/^\s*UNION(\s+ALL)?\s+/i);
        
        if (unionMatch) {
          // Найден UNION
          const isUnionAll = !!unionMatch[1];
          
          if (currentQuery.trim()) {
            parts.push({
              query: currentQuery.trim(),
              isUnionAll: false // UNION относится к следующему запросу
            });
          }
          
          currentQuery = '';
          i += unionMatch[0].length;
          
          // Следующий запрос будет помечен как UNION
          if (parts.length === 0) {
            // Это не должно происходить, но на всякий случай
            parts.push({
              query: '',
              isUnionAll: false
            });
          }
          
          // Запоминаем что следующий запрос имеет UNION
          const nextQueryStartsWithUnion = { isUnionAll };
          
          // Читаем следующий запрос
          let nextQuery = '';
          while (i < text.length) {
            const nextChar = text[i];
            const nextRemaining = text.substring(i);
            const nextUnionMatch = nextRemaining.match(/^\s*UNION(\s+ALL)?\s+/i);
            
            if (nextUnionMatch && depth === 0 && !inQuotes) {
              // Найден следующий UNION
              break;
            }
            
            if (nextChar === '(' && !inQuotes) depth++;
            else if (nextChar === ')' && !inQuotes) depth--;
            else if ((nextChar === '"' || nextChar === "'") && text[i-1] !== '\\') {
              if (!inQuotes) {
                inQuotes = true;
                quoteChar = nextChar;
              } else if (nextChar === quoteChar) {
                inQuotes = false;
                quoteChar = '';
              }
            }
            
            nextQuery += nextChar;
            i++;
          }
          
          if (nextQuery.trim()) {
            parts.push({
              query: nextQuery.trim(),
              isUnionAll: nextQueryStartsWithUnion.isUnionAll
            });
          }
          
          currentQuery = '';
          continue;
        }
      }
    }
    
    currentQuery += char;
    i++;
  }
  
  // Добавляем последнюю часть
  if (currentQuery.trim()) {
    parts.push({
      query: currentQuery.trim(),
      isUnionAll: false
    });
  }
  
  // Если нет частей, добавляем весь текст
  if (parts.length === 0 && text.trim()) {
    parts.push({
      query: text.trim(),
      isUnionAll: false
    });
  }
  
  return parts;
}

function parseSelectQuery(queryText) {
  console.log('Парсим SELECT запрос:', queryText);
  
  const query = {
    name: '',
    selectedTables: [],
    fields: [],
    joins: [],
    filters: [],
    groupBy: [],
    orderBy: [],
    limit: null,
    offset: null,
    unionAllNext: false,
    groupByInput: '',
    orderByInput: { field: '', dir: 'ASC' }
  };

  try {
    // Разбиваем запрос на основные части
    const parts = splitQueryIntoParts(queryText);
    console.log('Части запроса:', parts);
    
    // Парсим каждую часть
    if (parts.select) {
      console.log('Парсим SELECT:', parts.select);
      parseSelectClause(parts.select, query);
    }
    if (parts.from) {
      console.log('Парсим FROM:', parts.from);
      parseFromClause(parts.from, query);
    }
    if (parts.joins) {
      console.log('Парсим JOIN:', parts.joins);
      parseJoins(parts.joins, query);
    }
    if (parts.where) {
      console.log('Парсим WHERE:', parts.where);
      parseWhereClause(parts.where, query);
    }
    if (parts.groupBy) {
      console.log('Парсим GROUP BY:', parts.groupBy);
      parseGroupByClause(parts.groupBy, query);
    }
    if (parts.orderBy) {
      console.log('Парсим ORDER BY:', parts.orderBy);
      parseOrderByClause(parts.orderBy, query);
    }
    if (parts.limit) {
      console.log('Парсим LIMIT:', parts.limit);
      parseLimitClause(parts.limit, query);
    }

    console.log('Итоговый запрос:', query);
    return query;
  } catch (error) {
    console.error('Ошибка парсинга SELECT запроса:', error);
    throw error;
  }
}

function splitQueryIntoParts(sql) {
  const parts = {};
  console.log('Разбираем SQL на части:', sql);
  
  // Более точное разбиение SQL на части
  const selectMatch = sql.match(/SELECT\s+(.*?)(?:\s+FROM|$)/is);
  
  // Для FROM ищем до первого JOIN или других ключевых слов
  const fromMatch = sql.match(/FROM\s+(.*?)(?:\s+(?:(?:LEFT|RIGHT|INNER|FULL)?\s*JOIN|WHERE|GROUP\s+BY|ORDER\s+BY|LIMIT)|$)/is);
  
  // Упрощенный и более надежный поиск JOIN
  const joinMatches = [];
  
  // Ищем все JOIN пошагово
  let searchStart = 0;
  while (true) {
    // Ищем следующий JOIN
    const joinIndex = sql.substring(searchStart).search(/\b(?:LEFT|RIGHT|INNER|FULL)?\s*JOIN\b/i);
    if (joinIndex === -1) break;
    
    const actualJoinIndex = searchStart + joinIndex;
    const joinStart = actualJoinIndex;
    
    // Находим конец этого JOIN (до следующего JOIN, WHERE, GROUP BY, ORDER BY, LIMIT)
    let joinEnd = joinStart;
    let depth = 0;
    let inQuotes = false;
    let quoteChar = '';
    
    // Ищем ON после JOIN
    const onMatch = sql.substring(joinStart).match(/\bJOIN\s+\w+\s+ON\b/i);
    if (!onMatch) {
      searchStart = joinStart + 1;
      continue;
    }
    
    joinEnd = joinStart + onMatch.index + onMatch[0].length;
    
    // Продолжаем искать конец ON условия
    while (joinEnd < sql.length) {
      const char = sql[joinEnd];
      const prevChar = joinEnd > 0 ? sql[joinEnd - 1] : '';
      
      // Обрабатываем кавычки
      if ((char === '"' || char === "'") && prevChar !== '\\') {
        if (!inQuotes) {
          inQuotes = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          inQuotes = false;
          quoteChar = '';
        }
      }
      
      if (!inQuotes) {
        if (char === '(') {
          depth++;
        } else if (char === ')') {
          depth--;
        } else if (depth === 0) {
          // Проверяем на ключевые слова
          const remaining = sql.substring(joinEnd);
          if (/^\s*(?:LEFT|RIGHT|INNER|FULL)?\s*JOIN\b/i.test(remaining) ||
              /^\s*WHERE\b/i.test(remaining) ||
              /^\s*GROUP\s+BY\b/i.test(remaining) ||
              /^\s*ORDER\s+BY\b/i.test(remaining) ||
              /^\s*LIMIT\b/i.test(remaining)) {
            break;
          }
        }
      }
      
      joinEnd++;
    }
    
    const joinClause = sql.substring(joinStart, joinEnd).trim();
    if (joinClause) {
      joinMatches.push(joinClause);
      console.log('Найден JOIN:', joinClause);
    }
    
    searchStart = joinEnd;
  }
  
  const whereMatch = sql.match(/WHERE\s+(.*?)(?:\s+(?:GROUP\s+BY|ORDER\s+BY|LIMIT)|$)/is);
  const groupByMatch = sql.match(/GROUP\s+BY\s+(.*?)(?:\s+(?:ORDER\s+BY|LIMIT)|$)/is);
  const orderByMatch = sql.match(/ORDER\s+BY\s+(.*?)(?:\s+LIMIT|$)/is);
  const limitMatch = sql.match(/LIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+))?/i);

  if (selectMatch) parts.select = selectMatch[1].trim();
  if (fromMatch) parts.from = fromMatch[1].trim();
  if (joinMatches.length > 0) parts.joins = joinMatches;
  if (whereMatch) parts.where = whereMatch[1].trim();
  if (groupByMatch) parts.groupBy = groupByMatch[1].trim();
  if (orderByMatch) parts.orderBy = orderByMatch[1].trim();
  if (limitMatch) parts.limit = limitMatch[0].trim();

  console.log('Результат разбора:', parts);
  return parts;
}

function parseSelectClause(selectText, query) {
  // Разбиваем поля по запятым (учитывая возможные функции)
  const fields = splitByCommaRespectingParentheses(selectText);
  
  fields.forEach(fieldText => {
    const field = parseField(fieldText.trim());
    if (field) {
      query.fields.push(field);
    }
  });
}

function parseField(fieldText) {
  console.log('Парсим поле:', fieldText);
  
  const field = {
    table: null,
    name: 'custom_field',
    alias: '',
    agg: '',
    expression: fieldText
  };

  let workingText = fieldText;

  // Проверяем на алиас (AS keyword или просто пробел)
  const aliasMatch = workingText.match(/^(.+?)\s+(?:AS\s+)?(\w+)$/i);
  if (aliasMatch) {
    field.expression = aliasMatch[1].trim();
    field.alias = aliasMatch[2];
    workingText = aliasMatch[1].trim();
  }

  // Проверяем на агрегатные функции
  const aggMatch = workingText.match(/^(COUNT|SUM|AVG|MIN|MAX)\s*\(/i);
  if (aggMatch) {
    // Устанавливаем тип агрегации в выпадашке и используем внутреннее выражение как expression
    field.agg = aggMatch[1].toUpperCase();

    // Извлекаем содержимое функции для определения table.field или '*'
    const innerField = workingText.match(/\((.+)\)/);
    if (innerField) {
      const innerTextRaw = innerField[1].trim();
      // Уберём возможные завершающие скобки от лишних пробелов
      const innerText = innerTextRaw.replace(/\)\s*$/,'').trim();

      // Сохраняем внутреннее выражение в поле expression, чтобы UI показывал чистое выражение
      field.expression = innerText;

      if (innerText === '*') {
        field.table = null;
        field.name = '*';
      } else {
        // Проверяем на table.field внутри агрегатной функции
        const tableFieldMatch = innerText.match(/^(\w+)\.(\w+)$/);
        if (tableFieldMatch) {
          field.table = tableFieldMatch[1];
          field.name = tableFieldMatch[2];
        } else if (!innerText.includes('(')) {
          field.name = innerText;
        }
      }
    }
  } else {
    // Если нет агрегатной функции, парсим как обычное поле
    const tableFieldMatch = workingText.match(/^(\w+)\.(\w+)$/);
    if (tableFieldMatch) {
      field.table = tableFieldMatch[1];
      field.name = tableFieldMatch[2];
    } else if (workingText !== '*' && !workingText.includes('(')) {
      field.name = workingText;
    }
  }

  console.log('Результат парсинга поля:', field);
  return field;
}

function parseFromClause(fromText, query) {
  // Простой парсинг FROM - берем первую таблицу
  const tableName = fromText.split(/\s+/)[0];
  if (tableName) {
    query.selectedTables.push(tableName);
  }
}

function parseJoins(joinTexts, query) {
  console.log('Парсим JOIN тексты:', joinTexts);
  joinTexts.forEach(joinText => {
    const join = parseJoin(joinText);
    if (join) {
      query.joins.push(join);
      console.log('Добавлен JOIN в запрос:', join);
    } else {
      console.log('Не удалось распарсить JOIN:', joinText);
    }
  });
  console.log('Итоговые JOIN в запросе:', query.joins);
}

function parseJoin(joinText) {
  console.log('Парсим JOIN:', joinText);
  
  // Парсим JOIN: LEFT JOIN table ON condition
  const joinMatch = joinText.match(/^(LEFT|RIGHT|INNER|FULL)?\s*JOIN\s+(\w+)\s+ON\s+(.+)$/i);
  if (!joinMatch) {
    console.log('Не удалось распарсить JOIN:', joinText);
    return null;
  }

  console.log('Найденные группы в JOIN:', joinMatch);

  const join = {
    type: (joinMatch[1] || 'INNER').toUpperCase(),
    rightTable: joinMatch[2],
    on: []
  };

  console.log('Создан JOIN объект:', join);

  // Парсим условия ON
  const conditions = splitByLogicalOperators(joinMatch[3]);
  console.log('Условия ON:', conditions);
  
  conditions.forEach(conditionObj => {
    const condMatch = conditionObj.condition.trim().match(/^(.+?)\s*(=|!=|>|<|>=|<=)\s*(.+)$/);
    if (condMatch) {
      join.on.push({
        left: condMatch[1].trim(),
        op: condMatch[2],
        right: condMatch[3].trim()
      });
    }
  });

  console.log('Итоговый JOIN:', join);
  return join;
}

function parseWhereClause(whereText, query) {
  // Парсинг WHERE - разбиваем по AND/OR
  const conditions = splitByLogicalOperators(whereText);
  
  conditions.forEach((conditionObj, index) => {
    const filter = parseCondition(conditionObj.condition);
    if (filter) {
      filter.logic = index < conditions.length - 1 ? conditionObj.nextOperator : 'AND';
      query.filters.push(filter);
    }
  });
}

function parseCondition(conditionText) {
  const condMatch = conditionText.trim().match(/^(.+?)\s*(=|!=|>|<|>=|<=|LIKE|IN|BETWEEN|IS\s+NULL|IS\s+NOT\s+NULL)\s*(.*)$/i);
  if (!condMatch) return null;

  return {
    field: condMatch[1].trim(),
    op: condMatch[2].toUpperCase().replace(/\s+/g, ' '),
    value: condMatch[3] ? condMatch[3].trim() : '',
    logic: 'AND'
  };
}

function parseGroupByClause(groupByText, query) {
  const fields = splitByCommaRespectingParentheses(groupByText);
  query.groupBy = fields.map(f => f.trim());
}

function parseOrderByClause(orderByText, query) {
  const fields = splitByCommaRespectingParentheses(orderByText);
  fields.forEach(fieldText => {
    const orderMatch = fieldText.trim().match(/^(.+?)\s+(ASC|DESC)$/i);
    if (orderMatch) {
      query.orderBy.push({
        field: orderMatch[1].trim(),
        dir: orderMatch[2].toUpperCase()
      });
    } else {
      query.orderBy.push({
        field: fieldText.trim(),
        dir: 'ASC'
      });
    }
  });
}

function parseLimitClause(limitText, query) {
  const limitMatch = limitText.match(/LIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+))?/i);
  if (limitMatch) {
    query.limit = parseInt(limitMatch[1]);
    if (limitMatch[2]) {
      query.offset = parseInt(limitMatch[2]);
    }
  }
}

// Утилитарные функции
function splitByCommaRespectingParentheses(text) {
  const result = [];
  let current = '';
  let parenthesesLevel = 0;
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const prevChar = i > 0 ? text[i - 1] : '';
    
    // Обрабатываем кавычки
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
      }
    }
    
    if (!inQuotes) {
      if (char === '(') {
        parenthesesLevel++;
      } else if (char === ')') {
        parenthesesLevel--;
      } else if (char === ',' && parenthesesLevel === 0) {
        result.push(current.trim());
        current = '';
        continue;
      }
    }
    
    current += char;
  }
  
  if (current.trim()) {
    result.push(current.trim());
  }
  
  return result;
}

function splitByLogicalOperators(text) {
  const result = [];
  const tokens = text.split(/\s+(AND|OR)\s+/i);
  
  for (let i = 0; i < tokens.length; i += 2) {
    const condition = tokens[i];
    const nextOperator = tokens[i + 1] || 'AND';
    result.push({
      condition: condition.trim(),
      nextOperator: nextOperator.toUpperCase()
    });
  }
  
  return result;
}
