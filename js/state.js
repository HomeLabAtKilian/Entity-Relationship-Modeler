export const state = {
    lineMode: false,
    deleteMode: false,
    lineStart: null,
    elementCounter: 0,
    selectedElements: new Set(),
    
    // Viewport
    scale: 1,
    panX: 0,
    panY: 0,
    isPanning: false,
    startPanX: 0,
    startPanY: 0,

    // Colors
    colors: {
        entity: "#ffa000",       
        relationship: "#0090ff", 
        attribute: "#13a200",    
        label: "transparent",
        schema: "#f0f0f0"
    }
};