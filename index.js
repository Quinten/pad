import { codeToImg, imgToCode, makeAutoSave } from './src/io.js';
import { toggleToEl, drawGridDots as uiDrawGridDots } from './src/ui/dom.js';
import { setRounding } from './src/editor/state.js';
import { initInteraction } from './src/editor/interaction.js';
import { initGallery } from './src/gallery.js';
import { createCollection } from './src/collection-client.js';

// gallery will be initialized below by initGallery which returns updateList
let updateList = () => {};

let collection = createCollection(() => updateList && updateList());

let autoSave = makeAutoSave(() => collection);


// delegated to src/io.js (codeToImg, imgToCode)


// button actions

window.newSvg = e => {
    collection.create({
        onCreated: content => {
            codeToImg(content);
            openView('editor');
        }
   });
};

window.importSvg = e => {
    collection.importItem({
        onImported: content => {
            codeToImg(content);
            openView('editor');
        }
   });
};

window.openGallery = e => {
    collection.save({
        content: imgToCode(),
        onSaved: () => {
            updateList();
            openView('gallery');
        }
    });
};

window.exportSvg = e => {
    collection.exportItem();
};

window.openSource = () => {
    collection.save({
        content: imgToCode(),
        onSaved: () => {
            openView('source');
        }
    });
};

window.applySource = () => {
    collection.save({
        content: document.getElementById('svgcode').value,
        onSaved: content => {
            codeToImg(content);
            openView('editor');
        }
    });
};

window.discardSource = () => {
    openView('editor');
};



window.onViewOpen = e => {};

window.openView = view => {
    toggleToEl(view);
    window.onViewOpen({view});
};

// select actions

import { deselectAllElements, selectElement, redrawCursors, removeElements, raiseElements, lowerElements, fillElements, strokeElements } from './src/editor/selection.js';

// wire window handlers to selection module (pass autoSave where needed)
window.removeElements = () => removeElements(() => autoSave);
window.raiseElements = () => raiseElements(() => autoSave);
window.lowerElements = () => lowerElements(() => autoSave);
window.fillElements = () => fillElements(() => autoSave);
window.strokeElements = () => strokeElements(() => autoSave);


let drawGridDots = uiDrawGridDots;

// initialize grid
drawGridDots();

window.updateRounding = () => {
    setRounding(Number(document.getElementById('rounding').value));
    drawGridDots();
};

// editor

// initialize interaction handlers
initInteraction(() => autoSave);

// render global handles initially

// initialize gallery (pass collection getter and autoSave)
updateList = initGallery(() => collection, () => autoSave);

