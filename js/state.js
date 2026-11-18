export const NOTATIONS = {
    chen: { label: 'Chen (1 / N / M)', values: ['', '1', 'N', 'M'] },
    mc: { label: 'Modified Chen (1 / C / M / MC)', values: ['', '1', 'C', 'M', 'MC'] },
    minmax: { label: '(min,max)', values: ['', '(0,1)', '(1,1)', '(0,n)', '(1,n)'] },
};

export const state = {
    lineMode: false,
    deleteMode: false,
    lineStart: null,
    elementCounter: 0,
    selectedElements: new Set(),
    viewMode: 'basic',
    notation: 'chen',

    // History: history[last] is always the current state
    history: [],
    redoStack: [],

    // Viewport
    scale: 1,
    panX: 0,
    panY: 0,
    isPanning: false,
    startPanX: 0,
    startPanY: 0,

    colors: {
        entity: '#ffa000',
        relationship: '#0090ff',
        attribute: '#13a200',
        label: 'transparent',
    },
};
