import Vue from 'vue';
import { demoSchema } from './utils/schema';

function createEmptyQuery() {
  return {
    name: 'Запрос',
    selectedTables: [],
    fields: [], // { table, name, alias, agg }
    joins: [], // { type, rightTable, on:[{left,op,right}] }
    filters: [], // { field, op, value, logic }
    groupBy: [],
    orderBy: [], // { field, dir }
    limit: null,
    offset: null,
    groupByInput: '',
    orderByInput: { field: '', dir: 'ASC' },
    unionAllNext: false,
  };
}

function createEmptyCTE() {
  return {
    name: 'cte_1',
    isCTE: true,
    queries: [createEmptyQuery()], // CTE содержит массив подзапросов для UNION
    currentQueryIndex: 0, // Текущий активный подзапрос в CTE
  };
}

export const store = Vue.observable({
  schema: demoSchema,
  queries: [ createEmptyQuery() ],
  currentQueryIndex: 0,
  ctes: [], // Common Table Expressions
  currentCTEIndex: -1, // -1 означает что выбран основной запрос, >= 0 - индекс CTE
});

export const getters = {
  currentQuery() { return store.queries[store.currentQueryIndex]; },
  currentCTE() { 
    return store.currentCTEIndex >= 0 ? store.ctes[store.currentCTEIndex] : null; 
  },
  // Возвращает текущий активный элемент (подзапрос CTE или основной запрос)
  currentItem() {
    if (store.currentCTEIndex >= 0) {
      const cte = store.ctes[store.currentCTEIndex];
      return cte.queries[cte.currentQueryIndex];
    }
    return store.queries[store.currentQueryIndex];
  },
  // Получаем все таблицы включая CTE
  allAvailableTables() {
    const baseTables = store.schema.tables.map(t => t.name);
    const cteTables = store.ctes.map(cte => cte.name);
    return [...baseTables, ...cteTables];
  }
};

export const mutations = {
  reset() {
    store.queries = [ createEmptyQuery() ];
    store.currentQueryIndex = 0;
    store.ctes = [];
    store.currentCTEIndex = -1;
  },
  addQuery() {
    const q = createEmptyQuery();
    q.name = `Запрос ${store.queries.length + 1}`;
    store.queries.push(q);
    store.currentQueryIndex = store.queries.length - 1;
    store.currentCTEIndex = -1; // Переключаемся на основные запросы
  },
  removeQuery(index) {
    if (store.queries.length === 1) return;
    store.queries.splice(index, 1);
    if (store.currentQueryIndex >= store.queries.length) {
      store.currentQueryIndex = store.queries.length - 1;
    }
  },
  selectQuery(index) {
    if (index >= 0 && index < store.queries.length) {
      store.currentQueryIndex = index;
      store.currentCTEIndex = -1; // Переключаемся на основные запросы
    }
  },
  
  // CTE mutations
  addCTE() {
    const cte = createEmptyCTE();
    cte.name = `cte_${store.ctes.length + 1}`;
    store.ctes.push(cte);
    store.currentCTEIndex = store.ctes.length - 1;
  },
  removeCTE(index) {
    if (store.ctes.length === 0) return;
    store.ctes.splice(index, 1);
    if (store.currentCTEIndex >= store.ctes.length) {
      store.currentCTEIndex = store.ctes.length > 0 ? store.ctes.length - 1 : -1;
    }
  },
  selectCTE(index) {
    if (index >= 0 && index < store.ctes.length) {
      store.currentCTEIndex = index;
    } else {
      store.currentCTEIndex = -1; // Переключаемся на основные запросы
    }
  },
  
  // Управление подзапросами внутри CTE
  addCTEQuery() {
    if (store.currentCTEIndex >= 0) {
      const cte = store.ctes[store.currentCTEIndex];
      const q = createEmptyQuery();
      q.name = `Подзапрос ${cte.queries.length + 1}`;
      cte.queries.push(q);
      cte.currentQueryIndex = cte.queries.length - 1;
    }
  },
  removeCTEQuery(index) {
    if (store.currentCTEIndex >= 0) {
      const cte = store.ctes[store.currentCTEIndex];
      if (cte.queries.length === 1) return;
      cte.queries.splice(index, 1);
      if (cte.currentQueryIndex >= cte.queries.length) {
        cte.currentQueryIndex = cte.queries.length - 1;
      }
    }
  },
  selectCTEQuery(index) {
    if (store.currentCTEIndex >= 0) {
      const cte = store.ctes[store.currentCTEIndex];
      if (index >= 0 && index < cte.queries.length) {
        cte.currentQueryIndex = index;
      }
    }
  },
};


