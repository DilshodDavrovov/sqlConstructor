<template>
  <div class="app">
    <aside class="sidebar">
      <div style="margin-bottom:10px;">
        <strong>Схема БД</strong>
      </div>
      <div class="list">
        <div v-for="table in extendedSchema.tables" :key="table.name" class="panel" style="padding:8px;">
          <div class="row" style="justify-content:space-between; cursor:pointer;" @click="toggleExpand(table.name)">
            <div>
              <strong>{{ table.name }}</strong>
              <span v-if="table.isCTE" class="chip" style="font-size: 10px; margin-left: 4px;">CTE</span>
              <span class="muted"> ({{ table.fields.length }})</span>
            </div>
            <span class="muted">{{ isExpanded(table.name) ? '−' : '+' }}</span>
          </div>
          <div v-if="isExpanded(table.name)" class="list" style="margin-top:6px;">
            <button v-for="f in table.fields" :key="table.name + '.' + f.name" class="chip"
              @click.stop="addFieldFromSidebar(table.name, f.name)">
              {{ table.name }}.{{ f.name }}
            </button>
          </div>
        </div>
      </div>
      <p class="muted">Совет: раскройте таблицу и нажмите на нужное поле</p>
    </aside>

    <section class="content">
      <div class="toolbar">
        <h1>SQL Конструктор</h1>
        <div class="spacer"></div>
        <button class="primary" @click="copySQL">Копировать SQL</button>
      </div>
      <!-- CTE вкладки -->
      <div class="tabs-bar">
        <div class="row" style="flex-wrap:nowrap; gap:8px; align-items:center; min-width:0;">
          <div class="row" style="gap:8px; overflow-x:auto; flex-shrink:1; min-width:0;">
            <div class="chip" :class="{active: store.currentCTEIndex === -1}" @click="selectCTE(-1)" style="user-select:none;">
              Основной запрос
            </div>
            <div v-for="(cte, idx) in store.ctes" :key="'cte-' + idx" class="chip" :class="{active: idx === store.currentCTEIndex}" @click="selectCTE(idx)" style="user-select:none;">
              {{ cte.name }}
            </div>
          </div>
          <button class="success" @click="addCTE" style="flex-shrink:0;">+ Добавить CTE</button>
        </div>
      </div>
      
      <!-- Обычные вкладки запросов (только когда выбран основной запрос) -->
      <div v-if="store.currentCTEIndex === -1" class="tabs-bar">
        <div class="row" style="flex-wrap:nowrap; gap:8px; align-items:center; min-width:0;">
          <div class="row" style="gap:8px; overflow-x:auto; flex-shrink:1; min-width:0;">
            <div v-for="(q, idx) in store.queries" :key="idx" class="chip" :class="{active: idx === store.currentQueryIndex}" @click="selectQuery(idx)" style="user-select:none;">
              {{ q.name || ('Запрос ' + (idx+1)) }}
            </div>
          </div>
          <button class="success" @click="addQuery" style="flex-shrink:0;">+ Добавить запрос</button>
          <label v-if="store.currentQueryIndex > 0" style="display:flex; align-items:center; gap:6px; white-space:nowrap; flex-shrink:0;">
            UNION ALL: <input type="checkbox" v-model="current.unionAllNext" />
          </label>
        </div>
      </div>
      
      <!-- Вкладки подзапросов CTE (только когда выбрана CTE) -->
      <div v-if="store.currentCTEIndex >= 0 && currentCTE" class="tabs-bar">
        <div class="row" style="flex-wrap:nowrap; gap:8px; align-items:center; min-width:0;">
          <div class="row" style="gap:8px; overflow-x:auto; flex-shrink:1; min-width:0;">
            <div v-for="(q, idx) in currentCTE.queries" :key="'cte-query-' + idx" class="chip" :class="{active: idx === currentCTE.currentQueryIndex}" @click="selectCTEQuery(idx)" style="user-select:none;">
              {{ q.name || ('Подзапрос ' + (idx+1)) }}
            </div>
          </div>
          <button class="success" @click="addCTEQuery" style="flex-shrink:0;">+ Добавить подзапрос</button>
          <label v-if="currentCTE && currentCTE.currentQueryIndex > 0" style="display:flex; align-items:center; gap:6px; white-space:nowrap; flex-shrink:0;">
            UNION ALL: <input type="checkbox" v-model="current.unionAllNext" />
          </label>
        </div>
      </div>
      <datalist id="field-options">
        <option v-for="opt in availableFields" :key="opt" :value="opt">{{ opt }}</option>
      </datalist>

      <div class="main">
        <div class="panel scroll">
          <div class="row" style="justify-content:space-between; margin-bottom:10px;">
            <div class="row" style="align-items:center; gap:10px;">
              <h2 style="margin:0;">Выбранные поля</h2>
              <div v-if="store.currentCTEIndex >= 0 && currentCTE && currentCTE.currentQueryIndex === 0" class="row" style="align-items:center; gap:6px;">
                <label>Имя CTE:</label>
                <input type="text" v-model="currentCTE.name" placeholder="cte_name" style="max-width:120px;" />
              </div>
            </div>
            <div class="row" style="gap:8px;">
              <button @click="addCustomField">+ Добавить поле</button>
              <!-- Кнопка удаления CTE -->
              <button v-if="store.currentCTEIndex >= 0 && store.ctes.length > 0 && currentCTE && currentCTE.currentQueryIndex === 0" @click="removeCTE(store.currentCTEIndex)" class="danger" title="Удалить CTE">
                Удалить CTE
              </button>
              <!-- Кнопка удаления обычного запроса -->
              <button v-if="store.currentCTEIndex === -1 && store.queries.length > 1" @click="removeQuery(store.currentQueryIndex)" class="danger" title="Удалить запрос">
                Удалить запрос
              </button>
              <!-- Кнопка удаления подзапроса CTE -->
              <button v-if="store.currentCTEIndex >= 0 && currentCTE && currentCTE.queries.length > 1" @click="removeCTEQuery(currentCTE.currentQueryIndex)" class="danger" title="Удалить подзапрос">
                Удалить подзапрос
              </button>
            </div>
          </div>
          <div class="section">
            <div v-if="current.fields.length === 0" class="muted">Добавьте поля из дерева слева</div>
            <div v-else class="table">
              <div class="thead">
                <div>Поле</div>
                <div>Алиас</div>
                <div>Агрегация</div>
                <div></div>
              </div>
              <div class="row" v-for="(sf, idx) in current.fields" :key="sf.table + '.' + sf.name">
                <div>
                  <input type="text" v-model="sf.expression" :placeholder="sf.table ? (sf.table + '.' + sf.name) : 'Выражение'" list="field-options" style="width:100%;" @input="onFieldExpressionChange(sf)" />
                </div>
                <div>
                  <input type="text" :placeholder="sf.name" v-model="sf.alias" />
                </div>
                <div>
                  <select v-model="sf.agg">
                    <option value="">(нет)</option>
                    <option>COUNT</option>
                    <option>SUM</option>
                    <option>AVG</option>
                    <option>MIN</option>
                    <option>MAX</option>
                  </select>
                </div>
                <div class="row" style="justify-content:space-between;">

                    <button class="ghost" title="Вверх" @click="moveFieldUp(idx)" :disabled="idx===0">▲</button>
                    <button class="ghost" title="Вниз" @click="moveFieldDown(idx)" :disabled="idx===current.fields.length-1">▼</button>
                    <button class="ghost" title="Удалить" @click="removeField(sf.table, sf.name)">×</button>

                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="row" style="justify-content:space-between;">
              <h2 style="margin:0;">Соединения (JOIN)</h2>
              <button @click="addJoin">Добавить JOIN</button>
            </div>
            <div class="list">
              <div v-if="current.joins.length===0" class="muted">Нет соединений</div>
              <div v-for="(j, idx) in current.joins" :key="idx" class="grid-3" style="align-items:end;">
                <div>
                  <label>Тип</label>
                  <select v-model="j.type">
                    <option>INNER</option>
                    <option>LEFT</option>
                    <option>RIGHT</option>
                    <option>FULL</option>
                  </select>
                </div>
                <div>
                  <label>Таблица</label>
                  <select v-model="j.rightTable">
                    <option v-for="t in allTables" :key="t" :value="t">{{ t }}</option>
                  </select>
                </div>
                <div class="row" style="gap:6px;">
                  <button class="ghost" @click="addJoinCondition(j)">+ Условие</button>
                  <button class="danger" @click="removeJoin(idx)">Удалить</button>
                </div>
                <div class="grid-4" v-for="(c, cIdx) in j.on" :key="cIdx" style="grid-column:1/-1;">
                  <div>
                    <label>Левая сторона</label>
                    <input type="text" v-model="c.left" placeholder="orders.user_id" list="field-options" @input="onFieldExpressionChange({expression: c.left})" />
                  </div>
                  <div>
                    <label>Оператор</label>
                    <select v-model="c.op">
                      <option>=</option>
                      <option>!=</option>
                      <option>></option>
                      <option><</option>
                    </select>
                  </div>
                  <div>
                    <label>Правая сторона</label>
                    <input type="text" v-model="c.right" placeholder="users.id" list="field-options" @input="onFieldExpressionChange({expression: c.right})" />
                  </div>
                  <div style="align-self: end;">
                    <button class="danger" @click="removeJoinCondition(j, cIdx)" title="Удалить условие">×</button>
                  </div>
                </div>
                <div class="hr" style="grid-column:1/-1;"></div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="row" style="justify-content:space-between;">
              <h2 style="margin:0;">Условия (WHERE)</h2>
              <button @click="addFilter">Добавить условие</button>
            </div>
            <div class="list">
              <div v-if="current.filters.length===0" class="muted">Нет условий</div>
              <div class="grid-3" v-for="(f, idx) in current.filters" :key="idx" style="align-items:end;">
                <div>
                  <label>Поле</label>
                  <input type="text" v-model="f.field" placeholder="users.age" list="field-options" @input="onFieldExpressionChange({expression: f.field})" />
                </div>
                <div>
                  <label>Оператор</label>
                  <select v-model="f.op">
                    <option>=</option>
                    <option>!=</option>
                    <option>></option>
                    <option><</option>
                    <option>>=</option>
                    <option><=</option>
                    <option>LIKE</option>
                    <option>IN</option>
                    <option>BETWEEN</option>
                    <option>IS NULL</option>
                    <option>IS NOT NULL</option>
                  </select>
                </div>
                <div>
                  <label>Значение</label>
                  <input type="text" v-model="f.value" placeholder="30 или 'john' или (1,2)" />
                </div>
                <div style="grid-column:1/-1; display:flex; gap:8px; align-items:center;">
                  <label>Связь со след. условием</label>
                  <select v-model="f.logic" style="width:120px;">
                    <option>AND</option>
                    <option>OR</option>
                  </select>
                  <button class="danger" style="margin-left:auto;" @click="removeFilter(idx)">Удалить</button>
                </div>
                <div class="hr" style="grid-column:1/-1;"></div>
              </div>
            </div>
          </div>

          <div class="section grid-2">
            <div class="panel">
              <h2>Группировка</h2>
              <div class="list">
                <div class="row">
                  <input type="text" v-model="current.groupByInput" placeholder="users.country, users.city" list="field-options" @input="onFieldExpressionChange({expression: current.groupByInput})" />
                  <button @click="addGroup">Добавить</button>
                </div>
                <div class="row" style="flex-wrap:wrap; gap:6px;">
                  <span class="chip" v-for="(g, idx) in current.groupBy" :key="idx">
                    {{ g }} <button class="ghost" @click="removeGroup(idx)">×</button>
                  </span>
                </div>
              </div>
              <div class="hr"></div>
              <h2>Сортировка</h2>
              <div class="list">
                <div class="row">
                  <input type="text" v-model="current.orderByInput.field" placeholder="users.created_at" list="field-options" @input="onFieldExpressionChange({expression: current.orderByInput.field})" />
                  <select v-model="current.orderByInput.dir" style="width:120px;">
                    <option>ASC</option>
                    <option>DESC</option>
                  </select>
                  <button @click="addOrder">Добавить</button>
                </div>
                <div class="list">
                  <div class="row" v-for="(o, idx) in current.orderBy" :key="idx" style="justify-content:space-between;">
                    <span>{{ o.field }} {{ o.dir }}</span>
                    <button class="ghost" @click="removeOrder(idx)">×</button>
                  </div>
                </div>
              </div>
              <div class="hr"></div>
              <h2>Лимит</h2>
              <div class="row">
                <input type="number" v-model.number="current.limit" min="0" placeholder="100" style="max-width:140px;" />
                <input type="number" v-model.number="current.offset" min="0" placeholder="0" style="max-width:140px;" />
              </div>
            </div>

          </div>
        </div>

        <div class="panel scroll" style="min-height:0;">
          <div class="row" style="justify-content:space-between; align-items:center; margin-bottom:10px;">
            <h2 style="margin:0;">SQL</h2>
            <div class="row" style="gap:8px;">
              <button v-if="isEditingSQL" @click="applySQLChanges" class="success" title="Применить изменения">Применить</button>
              <button v-if="isEditingSQL" @click="cancelSQLEditing" class="ghost" title="Отменить изменения">Отмена</button>
              <button v-if="!isEditingSQL" @click="startSQLEditing" class="ghost" title="Редактировать SQL">Редактировать</button>
            </div>
          </div>
          <textarea 
            v-if="isEditingSQL" 
            v-model="editableSQL" 
            class="sql" 
            style="resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; min-height:160px; white-space: pre;">
          </textarea>
          <pre v-else class="sql">{{ sql }}</pre>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
import { store, getters, mutations } from './store';
import { buildSQLFromQueries } from './utils/sql';
import { parseCompleteSQL } from './utils/advancedSqlParser';

export default {
  name: 'App',
  data() {
    return { 
      store, 
      expanded: {},
      isEditingSQL: false,
      editableSQL: ''
    };
  },
  computed: {
    current() { return getters.currentItem(); }, // Теперь возвращает либо CTE, либо обычный запрос
    allTables() {
      const base = this.store.schema.tables.map(t => t.name);
      const cteTables = this.store.ctes.map(cte => cte.name);
      return Array.from(new Set([...base, ...cteTables, ...this.current.selectedTables]));
    },
    availableFields() {
      const tables = new Set(this.current.selectedTables);
      for (const f of this.current.fields) tables.add(f.table);
      const options = [];
      
      // Добавляем поля из обычных таблиц
      for (const t of this.store.schema.tables) {
        if (!tables.has(t.name)) continue;
        for (const f of t.fields) options.push(`${t.name}.${f.name}`);
      }
      
      // Добавляем поля из CTE (предполагаем что все поля доступны как cte_name.*)
      for (const cte of this.store.ctes) {
        if (!tables.has(cte.name)) continue;
        // Для CTE добавляем все поля из первого подзапроса (UNION должен иметь одинаковые поля)
        const firstQuery = cte.queries && cte.queries.length > 0 ? cte.queries[0] : null;
        if (firstQuery) {
          for (const f of firstQuery.fields) {
            const fieldName = f.alias || f.name;
            options.push(`${cte.name}.${fieldName}`);
          }
        }
      }
      
      return options;
    },
    sql() {
      return buildSQLFromQueries(this.store.queries, this.store.ctes);
    },
    // Расширенная схема включающая CTE как виртуальные таблицы
    extendedSchema() {
      const cteVirtualTables = this.store.ctes.map(cte => {
        // Для CTE с UNION берем поля из первого подзапроса
        const firstQuery = cte.queries && cte.queries.length > 0 ? cte.queries[0] : null;
        const fields = firstQuery ? firstQuery.fields.map(f => ({
          name: f.alias || f.name
        })) : [];
        
        return {
          name: cte.name,
          fields,
          isCTE: true
        };
      });
      
      return {
        tables: [...this.store.schema.tables, ...cteVirtualTables]
      };
    },
    // Получаем текущую CTE для отображения её подзапросов
    currentCTE() {
      return getters.currentCTE();
    }
  },
  methods: {
    addQuery: mutations.addQuery,
    removeQuery: mutations.removeQuery,
    selectQuery: mutations.selectQuery,
    addCTE: mutations.addCTE,
    removeCTE: mutations.removeCTE,
    selectCTE: mutations.selectCTE,
    addCTEQuery: mutations.addCTEQuery,
    removeCTEQuery: mutations.removeCTEQuery,
    selectCTEQuery: mutations.selectCTEQuery,
    isExpanded(t) { return !!this.expanded[t]; },
    toggleExpand(t) { this.$set(this.expanded, t, !this.expanded[t]); },
    
    // Проверяет, есть ли таблица в FROM (первая выбранная таблица)
    isTableInFrom(tableName) {
      return this.current.selectedTables.length > 0 && this.current.selectedTables[0] === tableName;
    },
    
    // Проверяет, есть ли таблица в JOIN
    isTableInJoin(tableName) {
      return this.current.joins.some(join => join.rightTable === tableName);
    },
    
    // Проверяет, доступна ли таблица в запросе (в FROM или JOIN)
    isTableAvailable(tableName) {
      return this.isTableInFrom(tableName) || this.isTableInJoin(tableName);
    },
    
    // Автоматически добавляет таблицу в LEFT JOIN, если её нет в FROM
    ensureTableAvailable(tableName) {
      if (!this.isTableAvailable(tableName)) {
        // Добавляем таблицу в LEFT JOIN
        this.current.joins.push({
          type: 'LEFT',
          rightTable: tableName,
          on: []
        });
      }
    },
    
    // Извлекает имена таблиц из выражения (например, "users.name, orders.total" -> ["users", "orders"])
    extractTablesFromExpression(expression) {
      if (!expression) return [];
      const tablePattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\./g;
      const tables = new Set();
      let match;
      while ((match = tablePattern.exec(expression)) !== null) {
        tables.add(match[1]);
      }
      return Array.from(tables);
    },
    
    // Обеспечивает доступность всех таблиц из выражения
    ensureTablesFromExpression(expression) {
      const tables = this.extractTablesFromExpression(expression);
      tables.forEach(table => {
        // Добавляем таблицу в selectedTables, если её там нет
        if (!this.current.selectedTables.includes(table)) {
          this.current.selectedTables.push(table);
        }
        // Добавляем в схему, если таблицы нет
        if (!this.store.schema.tables.find(x => x.name === table)) {
          this.store.schema.tables.push({ name: table, fields: [] });
        }
        // Обеспечиваем доступность таблицы в запросе
        this.ensureTableAvailable(table);
      });
    },
    
    addFieldFromSidebar(table, field) {
      if (!this.isFieldSelected(table, field)) {
        this.current.fields.push({ 
          table, 
          name: field, 
          alias: '', 
          agg: '',
          expression: `${table}.${field}`
        });
      }
      
      // Добавляем таблицу в selectedTables, если её там нет
      if (!this.current.selectedTables.includes(table)) {
        this.current.selectedTables.push(table);
      }
      
      // Проверяем, доступна ли таблица в запросе, и добавляем в LEFT JOIN если нет
      this.ensureTableAvailable(table);
    },
    isTableSelected(t) { return this.current.selectedTables.includes(t); },
    // table header click now only toggles expand; selection is managed by fields
    isFieldSelected(t, f) { return !!this.current.fields.find(x => x.table===t && x.name===f); },
    findOrCreateField(t, f) {
      let item = this.current.fields.find(x => x.table===t && x.name===f);
      if (!item) { 
        item = { 
          table:t, 
          name:f, 
          alias:'', 
          agg:'',
          expression: `${t}.${f}`
        }; 
        this.current.fields.push(item); 
      }
      return item;
    },
    removeField(t, f) {
      const idx = this.current.fields.findIndex(x => x.table===t && x.name===f);
      if (idx !== -1) this.current.fields.splice(idx,1);
    },
    moveFieldUp(i) {
      if (i <= 0) return;
      const arr = this.current.fields;
      const tmp = arr[i-1];
      this.$set(arr, i-1, arr[i]);
      this.$set(arr, i, tmp);
    },
    moveFieldDown(i) {
      const arr = this.current.fields;
      if (i < 0 || i >= arr.length-1) return;
      const tmp = arr[i+1];
      this.$set(arr, i+1, arr[i]);
      this.$set(arr, i, tmp);
    },
    addCustomField() {
      this.current.fields.push({
        table: null,
        name: 'custom_field',
        alias: '',
        agg: '',
        expression: 'NULL'
      });
    },
    
    // Обработчик изменения выражения поля
    onFieldExpressionChange(field) {
      if (field.expression) {
        this.ensureTablesFromExpression(field.expression);
      }
    },
    addJoin() { this.current.joins.push({ type:'INNER', rightTable:this.current.selectedTables[0] || '', on:[] }); },
    removeJoin(i) { this.current.joins.splice(i,1); },
    addJoinCondition(j) { j.on.push({ left:'', op:'=', right:'' }); },
    removeJoinCondition(join, conditionIndex) { join.on.splice(conditionIndex, 1); },
    addFilter() { this.current.filters.push({ field:'', op:'=', value:'', logic:'AND' }); },
    removeFilter(i) { this.current.filters.splice(i,1); },
    addGroup() {
      const items = (this.current.groupByInput || '').split(',').map(s => s.trim()).filter(Boolean);
      this.current.groupBy.push(...items);
      this.current.groupByInput = '';
    },
    removeGroup(i) { this.current.groupBy.splice(i,1); },
    addOrder() {
      if (!this.current.orderByInput.field) return;
      this.current.orderBy.push({ field:this.current.orderByInput.field, dir:this.current.orderByInput.dir || 'ASC' });
      this.current.orderByInput = { field:'', dir:'ASC' };
    },
    removeOrder(i) { this.current.orderBy.splice(i,1); },
    copySQL() {
      const text = this.sql;
      navigator.clipboard?.writeText(text).catch(() => {
        const area = document.createElement('textarea');
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
      });
    },
    
    // Методы для редактирования SQL
    startSQLEditing() {
      this.isEditingSQL = true;
      this.editableSQL = this.sql;
    },
    
    cancelSQLEditing() {
      this.isEditingSQL = false;
      this.editableSQL = '';
    },
    
    applySQLChanges() {
      try {
        console.log('Применяем SQL:', this.editableSQL);
        
        // Парсим SQL и обновляем конструктор
        this.parseAndApplySQL(this.editableSQL);
        this.isEditingSQL = false;
        this.editableSQL = '';
        console.log('SQL успешно применен');
      } catch (error) {
        alert('Ошибка при разборе SQL: ' + error.message);
        console.error('Ошибка парсинга SQL:', error);
      }
    },
    
    // Парсинг SQL и обновление всего состояния конструктора
    parseAndApplySQL(sqlText) {
      const parsed = parseCompleteSQL(sqlText);
      console.log('Результат парсинга:', parsed);
      
      // Создаем резервную копию текущего состояния
      const backup = {
        queries: JSON.parse(JSON.stringify(this.store.queries)),
        ctes: JSON.parse(JSON.stringify(this.store.ctes)),
        currentQueryIndex: this.store.currentQueryIndex,
        currentCTEIndex: this.store.currentCTEIndex
      };
      
      try {
        // Обновляем CTE
        this.store.ctes = parsed.ctes.map(cte => ({
          ...cte,
          queries: cte.queries.map(query => this.normalizeQuery(query))
        }));
        
        // Обновляем основные запросы
        this.store.queries = parsed.queries.map(query => this.normalizeQuery(query));
        
        // Убеждаемся что есть хотя бы один запрос
        if (this.store.queries.length === 0) {
          this.store.queries = [this.createEmptyQuery()];
        }
        
        // Сбрасываем индексы если они стали невалидными
        if (this.store.currentQueryIndex >= this.store.queries.length) {
          this.store.currentQueryIndex = 0;
        }
        
        if (this.store.currentCTEIndex >= this.store.ctes.length) {
          this.store.currentCTEIndex = -1;
        }
        
        // Обновляем схему с новыми таблицами
        this.updateSchemaFromParsedData(parsed);
        
      } catch (error) {
        // Восстанавливаем из резервной копии при ошибке
        this.store.queries = backup.queries;
        this.store.ctes = backup.ctes;
        this.store.currentQueryIndex = backup.currentQueryIndex;
        this.store.currentCTEIndex = backup.currentCTEIndex;
        throw error;
      }
    },
    
    // Нормализует запрос для соответствия ожидаемой структуре
    normalizeQuery(query) {
      return {
        name: query.name || 'Запрос',
        selectedTables: query.selectedTables || [],
        fields: query.fields || [],
        joins: query.joins || [],
        filters: query.filters || [],
        groupBy: query.groupBy || [],
        orderBy: query.orderBy || [],
        limit: query.limit || null,
        offset: query.offset || null,
        unionAllNext: query.unionAllNext || false,
        groupByInput: query.groupByInput || '',
        orderByInput: query.orderByInput || { field: '', dir: 'ASC' }
      };
    },
    
    // Создает пустой запрос с правильной структурой
    createEmptyQuery() {
      return {
        name: 'Запрос',
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
    },
    
    // Обновляет схему БД новыми таблицами из парсера
    updateSchemaFromParsedData(parsed) {
      const allTables = new Set();
      
      // Собираем все таблицы из CTE
      parsed.ctes.forEach(cte => {
        cte.queries.forEach(query => {
          query.selectedTables.forEach(table => allTables.add(table));
          query.joins.forEach(join => allTables.add(join.rightTable));
        });
      });
      
      // Собираем все таблицы из основных запросов
      parsed.queries.forEach(query => {
        query.selectedTables.forEach(table => allTables.add(table));
        query.joins.forEach(join => allTables.add(join.rightTable));
      });
      
      // Добавляем новые таблицы в схему
      allTables.forEach(tableName => {
        if (!this.store.schema.tables.find(t => t.name === tableName)) {
          this.store.schema.tables.push({
            name: tableName,
            fields: [] // Поля будут добавлены автоматически при использовании
          });
        }
      });
    },
    
    // Обновляем метод для работы с расширенной схемой
    tableFields(t) {
      const table = this.extendedSchema.tables.find(x => x.name === t);
      return table ? table.fields : [];
    }
  }
};
</script>

<style scoped>
</style>


