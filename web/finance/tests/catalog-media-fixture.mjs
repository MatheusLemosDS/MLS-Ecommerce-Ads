import {projectVariantCatalog} from '../src/variant-catalog-frame.mjs';
export const CATALOG_MEDIA_FIXTURE_TIME=Date.UTC(2026,9,25,12)/1000;
export const CATALOG_MEDIA_FIXTURE_PHOTO='https://down-br.img.susercontent.com/file/SYNTHETIC-product-photo.png';
export function catalogMediaLegacyFixture({item='101',at=CATALOG_MEDIA_FIXTURE_TIME,fingerprint='a'.repeat(64)}={}){
 const value={schema:'variant_catalog_v1',checked_at:at,products:[{item_id:item,catalog_fingerprint:fingerprint,selling_unit:'SINGLE_GARMENT',bindings:[{item_id:item,model_id:'1',size:'M'}],unresolved_count:0,cost_catalog:{schema:'product_cost_catalog_v1',product_name:'Produto sintético',variants:[{model_id:'1',attributes:[{name:'Cor',value:'Azul'},{name:'Tamanho',value:'M'}]}]}}]};
 if(!projectVariantCatalog(value))throw Error('SYNTHETIC_CATALOG_INVALID');return value;
}
export function catalogMediaFixture({state='AVAILABLE',url=CATALOG_MEDIA_FIXTURE_PHOTO,...options}={}){
 const catalog=catalogMediaLegacyFixture(options);return {schema:'variant_catalog_media_v1',catalog,media:catalog.products.map(row=>({item_id:row.item_id,catalog_fingerprint:row.catalog_fingerprint,checked_at:catalog.checked_at,state,image_url:state==='AVAILABLE'?url:null,basis:'CURRENT_PRODUCT_PHOTO_NOT_PRINT_ARTWORK'}))};
}
