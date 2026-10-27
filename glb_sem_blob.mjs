/* Texturas embutidas nos .glb sem passar por URL blob: (27/10).
 *
 * O GLTFLoader do three faz, pra cada imagem do bufferView: Blob → URL.createObjectURL → fetch dessa
 * URL pelo ImageBitmapLoader → revokeObjectURL. Cada textura vira uma linha "blob:http://…" na aba
 * Network, e como a URL já foi revogada o Preview do F12 mostra imagem quebrada (centenas delas).
 * Aqui o parser decodifica o Blob direto com createImageBitmap — mesmo resultado, sem fetch nem blob.
 * Navegador sem ImageBitmapLoader (Safari < 17, Firefox < 98) segue o caminho original.
 *
 * Basta importar uma vez antes de qualquer GLB (index.html): vale pra todo `new GLTFLoader()`,
 * inclusive os do menus.mjs e do personagem.mjs (mesmo módulo do three).
 */
import { Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* O GLTFParser não é exportado: um parse vazio entrega a instância ao plugin e daí o protótipo. */
let Parser = null;
new GLTFLoader().register(p => { Parser = Object.getPrototypeOf(p); return { name: 'ss_sem_blob' }; }).parse({ asset: { version: '2.0' } }, '', () => {}, () => {});

const original = Parser.loadImageSource;
Parser.loadImageSource = function (sourceIndex, loader) {
  const def = this.json.images[sourceIndex];
  if (def.bufferView === undefined || loader.isImageBitmapLoader !== true) return original.call(this, sourceIndex, loader);
  if (this.sourceCache[sourceIndex] !== undefined) return this.sourceCache[sourceIndex].then(t => t.clone());
  const promise = this.getDependency('bufferView', def.bufferView)
    .then(buf => createImageBitmap(new Blob([buf], { type: def.mimeType }), { ...loader.options, colorSpaceConversion: 'none' }))   // as mesmas opções do ImageBitmapLoader.load
    .then(bmp => {
      const tex = new Texture(bmp);
      tex.needsUpdate = true;
      if (def.extras && typeof def.extras === 'object') Object.assign(tex.userData, def.extras);
      tex.userData.mimeType = def.mimeType;
      return tex;
    })
    .catch(e => { console.error('THREE.GLTFLoader: Couldn\'t load texture', sourceIndex, def.name || ''); throw e; });   // o loadTexture devolve null (index.html trata textura null)
  this.sourceCache[sourceIndex] = promise;
  return promise;
};
