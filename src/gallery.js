import { codeToImg, imgToCode } from './io.js';
// openView will be provided by index.js after initialization; gallery receives it as an argument

// NOTE: index.js will pass a getter for collection: () => collection
export function initGallery(getCollection, getAutoSave) {
    const updateList = () => {
        let list = document.getElementById('list');
        list.innerHTML = '';
        getCollection().list({
            onItem: item => {
                let {key, value} = item;
                let {content} = value;
                let img = document.createElement('img');
                img.src = 'data:image/svg+xml,' + encodeURIComponent(content);
                img.dataset.key = key;
                img.onclick = e => {
                    getCollection().open({
                        key: Number(e.target.dataset.key),
                        onOpened: svgContent => {
                            codeToImg(svgContent);
                            openView('editor');
                        }
                    });
                };
                list.prepend(img);
            }
        });
    };

    // window handlers
    window.newSvg = e => {
        getCollection().create({
            onCreated: content => {
                codeToImg(content);
                openView('editor');
            }
        });
    };

    window.importSvg = e => {
        getCollection().importItem({
            onImported: content => {
                codeToImg(content);
                openView('editor');
            }
        });
    };

    window.openGallery = e => {
        getCollection().save({
            content: imgToCode(),
            onSaved: () => {
                updateList();
                openView('gallery');
            }
        });
    };

    window.exportSvg = e => {
        getCollection().exportItem();
    };

    window.openSource = () => {
        getCollection().save({
            content: imgToCode(),
            onSaved: () => {
                openView('source');
            }
        });
    };

    window.applySource = () => {
        getCollection().save({
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

    return updateList;
}
