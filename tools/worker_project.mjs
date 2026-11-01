import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TARGETS = Object.freeze({
  app: Object.freeze({name: 'brazacommerce-app', main: '../../dist/app-worker.mjs', baselineHashes: [
    '926e750890a31a00d1c25acd7bca1451f9faaa10fc882e0b667745fcba656106',
    '66968768bac6a7f5f0e60cfc2ed42b0a0924330025a84ce6e8c2b8754bd6fc50',
    'c1b1909fd49353fd065298a3852d6a2ff684980d4da11a0cff832be1eb11fe1e',
    '936c2cb0659f79805df88e66bf10ea198c30a052dfbd22cf53dfe2bccc396cab',
    '20d0ca1e46e6cef5d374b84cce2231994ced89a2aeb289f8c4b7223a3cf14ca6',
    '8cbbf7c123c4ac2a3dd128198d90cc3ad9d04e1a53a66719419ac1d60c27e7a6',
    'e58fb92ea20a0f0c1927386afb0349b663eb34b6514cce74a6a663f3089041eb',
    'b56f8241d1545a93f30d80a3d8b8d7d3928a08b6555033228c9ddc5a95fcd5a0',
    '9fe5906fc04f231aaddfd2fe8106e338c6aa7a1bd1203500e3b565a8a3892b7e',
    '629b1f2ce21c4d391cb04ddf5df5affd4f3093e3e7f9d7131d82d79f8fc5fc75',
    '07eabb013efa88002285a4de1177a9e8ca3e51bd6c60dbe24414c3b150cc2617',
    '2b2ef6d0cd48a51abcf0fcdb0106a5bb7f18fc0017fce8196db82238a8f8e1b9',
    '37f43b13f7f6e130e6ddb10e4065abb1744e3edb8aacf3124c2fd05ea1a99ed2',
    '6737c5654248ded292c168a9e3f9ad77c9be1543a3af41b9f480591683495e24',
    'a6bbda610f89fd6b7ed9c07900f515229a588f8df3786c93b31bfe0fb9a79cb2',
    'c1f16970681d587771e6912b6462d0978d0c0d485825211bac3fb6b0d480e081',
    '98c5c1e436d1fb35377dbaedb33888169b5cfe8c15855634d6386d044748396e',
    // Reviewed closed-month coverage gaps in completed scans with shorter cutoffs.
    'da9c248a849ba7c0af70dbd81ee79aa6ce4c23cac2c82c55aed785cdfbc8a850',
    // Reviewed bounded three-month calendar continuation with persisted target rotation.
    '7d9bd1772790232965cfc93d479dd8131d7eecc052a20c98684e65f8b78c1c3f',
    // Reviewed calendar alternation through current-month local retry waits.
    '21446508dd6ac2927359fd5574db61ef3ea574b365b75dae0b55950272eeb964',
    // Reviewed historical-calendar fairness through local and post-read failures.
    '015354b72091e237a4eafdf87315f28b4e2273a6f66bc8e7cf0cda8b45f447f8',
    // Reviewed bounded historical calendar selection and guarded resumable reads.
    '7fc52c172e00f6522362c9206d4ec505c8124d821e8390ed42f4455c9f20076d',
    // Reviewed bootstrap cooldown independent of ordinary auxiliary activity.
    '0dd75e25c8119c7f8d952a68b372b61387357de4092a525db8ee38a690ff8739',
    // Reviewed bounded first-coverage scheduling; preserves Finance/Returns quotas.
    'fdf8ead382bb3eaf04a3e5ed98efeb01dbc9f42d160aea64f0cb1fe8e8750e19',
    // Reviewed M2 release coverage and source-recovery candidate; requires CI/remote checks.
    '96479753e47632a64616f4d2b8cee261641d7cb2c84ceef6dabb58dd001461a7',
    // Reviewed agent-memory/ROAS candidate; requires full CI and remote byte verification.
    '6aa689d9bc36c3dfa89d46de5ee7bf82dce0ff19795d85249a08b3aec75b0819',
    '3b283c66de5e1b8b4041f113f8fda8ef640400d480a8e228b5b5834ffca4a2a7',
    'b1792536a065a76b06886096838340e6c0c2daecbdb51d047bf0e63318e4437a',
    'cd56ad20a6e443c004437a902088faece0a863fd7c120fa16334b6e2e9738ba4',
    '1fa1a79fb5db9430363c89d1ba8b451ccbf49445113cddd85fd47b72db62815f',
    'ba4e8db869b725430a6daf1f82380d18d515d73912df0fe815eea4657ac84c9d',
    '969b752387f1604ee92ceae12fc52e669e80671eb8daf62d402f28890e055799',
    'f6c39049a0e02bf87dbc3719c7b71cae1595b54a4525671cdfcbb4fe1bbbd17a',
    'a5b9b028cbe280842c519940dd577e81d3cc6eb4e3f7a0291d54727026feffb1',
    '011af3eed2d86149b2c0217e8bc424e6308f49896160d11e16d93429c9152dbe',
    'f8480ffe86d2469689ac5feb15584cef4ec5e99f351cd09bb4ed668620863c27',
    '4e4ad0bbfb9696e47237dee1f075cd411eccf5bfca2022bd94b51847f85fa449',
    '87d6129aa5fcf42d7a0f6ad0ea9903d27ae9230cb3e6a4a2c3eb214438a6f704',
    'd7de94f0ebc13ee48e49abe72eb7dbd213453f5a8eeda8f726fdc2b8961ea397',
    'e842040c9447714bd76b528f2def5d768b58c13d6402cb8b71ff781050797a22',
    '6d8ada1e928f1d70d265ab6c05a7c95610cb1b0fcbd31380ef8531ae1751f31c',
    '67d153521fe3d4dd43877928bc6cc9b19d4df77ac95e531bd055b5059d9f9911',
    '72162f27b11f28a4307e2e18a930661f604d1c963549e84bb899b68c7383f42e',
    'e25f96947304483955db06d33c3314e902dcf9dcf316cd7e14d635b90e382b1b',
    'e3f73bd0e5980d708a3e8df04ac7b98d8925e91c36d8b8282571e17dce673ebb',
    '2ca1bb300336725a1a1f1c0da1e9a6e3f770fff439e937f09bedb54643b5a30b',
    'e8117e73c1e60d8fea99c6e2ca250816f7a20541dcaba5771f93579ad1f421f0',
    '042d6243a0fbff27e8bb8e09547652eb5e7a595397dca8572e1f19349682fc4f',
    '08d6f53b59ee6fada92b6141eb06db9651f005b3030df12c22bf6747e9f282bf',
    'ed50bd66b3aeaa86e948584996a7998cb92f298250a9750faee817f4c8d81197',
    'a278373fa2e127ea05d4da8eb8a65bbb3485cfc4f7df39b0c63e2590262bf67f',
    '873976efcdf36ddb46df71227220b09192fc1f7de8d3148f788b6823fdd5ef75',
    '5d8e3d9ff3036ce39155d9bf969810573c845dc59a94e6c50877b9b6d22f6168',
    'c11b7c261ad1585558ee3c66098acc774e2edb81bf90ef06e6a5885bba26ead4',
    'fc12e0d1e834a6024444e95aa7db083999cd6511c3772277271cae611a7baf8b',
    '43b350cb1cd83268b668bb512aeada9d1648129b96b3fcdf382db1b3fe30fc1a',
    '046e83018039b84fc6143d821c36eac374fc53f9d2b736db2c58248c86ede198',
    'f67e825940162870151512e5287c435cf88764ab484bbfd0774be2215c30359d',
    'f5272faa4a6ebbfee9872c7e2022141a99e83733e199cb5d78c57e853b994755',
    '35ac62470fb1a49d4b9b1494b7f2c7c694653ead6cd5c2eaf9e2d21a3940fc2d',
    'd36cd2fe8799acab15093b051e828f3e479a37d341da0da6f61b13d30fc5ba12',
    '2875a652ee51d432c320572ad61b731a09a54c9f5e35c7d60e5efe3157078db4',
    'abe17138a2b50758a4910bc87dcba4bd59a2d73b2c366387768e905b46922780',
    '2d28746af22c37d2117d24cc575fafc2d94d67b03b1b1e75d6c59113e8bf8358',
    '49878f6a57b564d5f1b1aef08278293a3dcb0ace620d72d8a993545f31e0d970',
    '9f0390254e9371830e26ba41e13b08baf768ea285edb128beef74a3cd355ac7f',
    'c2072eb47a19399686a35a71d82f81e201bde2cc23cfa26144586e99606f978e',
    '0fd03d1c15a62023de6d9f5e3e099512f79a039e2fea2ab7ad27e85e03749c73',
    '944f931b03061735820744dc95a5a57fdeb192d8b5f9785f166e01323997ed2e',
    'ee881ab662ae562ad0a482640d38b178adda2dea6d87c6ec9aff87153d1cac3b',
    '3931c18ac1235b727c4a679303a5a69ef413f423f65b100961e744e71597b965',
    'e3d585fc9058b346ed91b52acd61f02f2dd77f15648392357c8adfeb221f74da',
    '4a5c0ffdc2ec45805b68729a78ae7008935751af6ea4aaf5bede1b0e539b6a55',
    'a2f2a3e7380e37545541b0282b7ec194fd6b3113d08fff63a940b59f56dadd5c',
    '52e0d332df2037b9e519302534a308dd3d3285aec0f6014c60d6022e71d13a66',
    '45f737d506e43bcf84aa98f576378e7005107ea03c9025a12510e60d8bdd45cc',
    'e5634e2e5cfd6e48553ce009fd801af06c13c3ec67b66cf11118c56513cd7801',
    'a9b05412032e21b51e7813729dc507e9906f4bb2b506970dce0cf6191ff806b4',
    'b0da04e120ff4edcac91a568aaf5b170b1f1f792947d868041ab5e131a1546c6',
    '9e5376fec20013178fd35ec490f8045f3712e526dbaf22576aa10fb424377745',
    'd6beb786c0c9b427f675456e4a75d0bf3a059e0cf60c5e6117d7d3eed01b9eaa',
    '9a068c005e7a0c9896ac27acf45ebdf3ac22dfef9c8f2d6b17ebd1fb8a54eb16',
    '49da8c7143fb89865b0c95b952ea728efb6a9cf5b6ead3627697d12c6e48a200',
    '96fce77bc55060984e389a315cba7197f926a579d1c10427ac8c83ce23bd5c82',
    '0878e7c6a4e8bfede3eedec7f8fdec2b8c6aee2a1f8d08fe7ee7782f8516993c',
    '1c95456d31be24183e567faa4fac5f5c0f2fd13c8a4ccfeea7df1b9ec426bd3d',
    '781826a58dc89719fc70104e3020f5a4e0a2eea5cdfcfda7d5c0c99f09881de2',
    'b43a3f4e7449df757fffadfe3f02ccfae5bf2432f4715cc5008bf2508c1359be',
    '53a2ec24e33b863fb954b21c116a5b799a443f4df9fd20b4e455df04e0221f2e',
    '4dcb5f2c437e0a5255fa62ba28b3c85075836130be464319b23f443f427779b6',
    'd6fe49f413953b431d4f26d56d30bd735b7e5e9279fc0f5b4431fbea9ac5df97',
    '3091bd91262804d92d2c4878b901382d964988b0d6a1e23df9545c185738e0b9',
    'a13122251291d5434240bb618822b6121fdb79831cffbb6dec7a5af5fab3e631',
    // Reviewed App build: persistent agent cards and direct agent navigation (PR #25).
    'e157ec1cb36199e270b0238e5c3ffee090d8d09b9f6168e49e3071945ea2d97e',
    // Reviewed App with owner-only read-only recovery diagnostic, PR #26.
    '982e362ebf5e453cf3089a9584190060078d42c0385159e749af07ca64c36fb1',
    // Reviewed P1 repair: null-month agent projection and control-byte-safe HTML.
    '9343fd6830cae6ab9d36fb5319e28f0b44dae966dfc21f4416c7845ab96f17b0',
    // Reviewed Mission Control App build with separated observer workspaces.
    '38329c3970c44e94b9f9ba52cf6461a793783f4a44434c9927076e1aea68085f',
    // Reviewed final Mission Control UI bundle with dark/light accessibility refinements.
    '6d21df2b0a5c8137b314fc732923b2d48863ff9538372f4d0a522092e9ad6596',
    // Reviewed Mission Control V2 cosmetic App bundle: browser and financial fixtures passed.
    '617c00ff2d1ed14e76ceb61be920e30fae8b34b5cae0a8d5ce44e935be4ad0e9',
    // Mission Control V2 final styling with light theme contrast; compiled and Chrome-tested.
    '4d3f45e406e3c9f5cab6041ca9d2aa0fb7dc3e0598c16d8eeb40889fce841a8c',
    // Reviewed M2 read-only 14-day charts, signed P&L and comparisons; real Chrome tested.
    '52fd0ee0a058ccb30160b8c8d13d26eb5775b146dc5b100c49abf626021d5cc2',
    // Reviewed final signed-trend UI with accurate partial-cost labels, horizontal controls and validated Chrome SVG.
    '44fd6b79785a9eeeaf76e92eae177c86a8d03884233d70635f9e7182cad8d71a',
    // V3 UI-only candidate bundle from Actions 40604512748: approval requires green full CI and browser review before merge.
    '525c277c5057d794e586b3c8b6098dbdd2e87b08a58d1e34d07b3a8721a80e8e',
    // V3 compact screenshot refinement, exact App build from GH Actions #218; CI gate required.
    '273dd2a046c5fe1d42efa65fd7642f0603cb3a6631b219753e3d4af442065593',
    // Observer-only evidence charts, cached sparse sparklines and hub filter; exact CI-generated App build, subject to full validation.
    '8ab1e794a6b44f9f80e6464da73db99f188c492abdd1d376bc65a771bc50d5af',
    // Reviewed candidate for bounded Hermes panel; exact App SHA from Actions #232, pending full CI.
    '777829a30410de6ecd89cb2a4fa066540537262f4b6484dfa25e9eaa2fe5ed02',
    // Agent source bridge: verified cached catalog/production/DTF data with Chromium late-hydration checks; exact Actions #235/#237 App build.
    '145c430ba855aa2ae3de646a54473fa4a56ae3500d9d725d298ae40f873cfb1e',
    // Mobile source-state feedback + two-column KPI layout; exact candidate App hash from CI #242, full regression gates required.
    '86d32027ed941cb2dbdc90e3a65d5151deef67a30cc4d5173695539a20a6d34b',
    // Reviewed candidate: PROVISIONAL daily-chart repair and published-date explanation, exact App bundle from Actions #246.
    'fefc0610966859991961706f93acbc3f960d476078a7bb4ab8e6afa2bdb65ba8',
    // Finance collector source progress and operator-only scheduling priority, exact candidate built by CI #249; final validation required.
    'b5b9a347c1c699451e6afd2b45f6c6051cd0353502048ba35023f6de47b46b9b',
    // Owner-only finance status/connect recovery links; exact build from Actions #253, no changes to Auth/Finance secrets or contracts.
    '618f8fcce4722f32834f92b6b23032137a4ac981644229d3302c3e533ea17d62',
    // Owner-only click-to-read finance scheduler diagnosis; exact App build from GH Actions #256, full CI/Chromium gate required.
    '34f13bfaeb81c8467d9a92dbf5d496dce90066b83906f11a10c59e38ce19b6aa',
    // V3.4 source-specific verified agent charts and truthful 14-day comparison diagnostics; exact App from CI #259.
    '618688a971b52f96df474c2e651ce42d1dd7cac5e3d1cb01d2cb1a1bced92f8b',
    // Mission Control V3.5 global navigation and source provenance; exact App from GH Actions #266, full CI still required.
    'b99d26849353f494ddb2cea12605a2f7ad0186a1407c91857946e0522d1b499f',
    // V3.6 explicit saved-catalog search handoff from keyboard palette, exact App from Actions #290; CI required.
    '55645f1f5ec777136254e0deb6e09e88cd542649097786992e3fb212af298078',
    // Bounded previous-month cancellation refresh; exact reviewed build, full CI required.
    '5609b8412ff643f8c4864bac68e2d55461ad97878fdff9f602f3bff642246a6a',
    // Reviewed PR45 V3.6 catalog source compatibility.
    '9349781be29daa3a5ac34e0b392586bbd651911da83d36149c2c926e2bd60e8b',
    // Reviewed PR48 V3.6 combined saved catalog and DTF search source.
    '080bcd884f1842023e384e180cd4e9e33fe3c58681596c86b4b6f0552216b68f',
    // MLS Listing Factory owner draft-only UI from Actions 40783813679; requires full CI/Chrome before review.
    'e228e899603c5b08b5d432558de6277faa4217d030c8cc0bb8d9692391c4ca4a',
    // Listing Factory local image decompression guard and default price propagation; exact CI App build from 40784662417.
    'd1bb7c43d40034f1629d18f159a8558cb6e8e7d540e3531d998a56377a3120b9',
    // MLS Listing Factory JSON resume, price-source gate and paged owner UI; exact App digest from CI 40788461939, full rerun required.
    'bbbe1b9efdf0a6c11e507c34c92730ddbb8502fb367c5cfe33c031ba3850d3cd',
    // Bulk local media relink in MLS Listing Factory, exact App SHA from Actions 40790379512; full validation required.
    '63da28d212c45d1e7e93444dbe4ac2ac49ad113af273dddf65370f668156180d',
    // V3.6 real catalog/DTF search + Listing Factory owner draft integration, exact App digest from GH Actions 40792060142; full CI required.
    '8ed059ddb6f0901a48d277d6b9b806a23d52a1e5e105ed0e2e456e2aea6701f5',
    // Mobile Listing Factory column-width repair observed by synthetic Chrome QA; exact App SHA from Actions 40794418436, all UI tests passed, integrity rerun required.
    '805caf375c1d060c3b3fcc88b6764c03153931a5ce97b017f5245752027e35c7',
    // Owner-only V3.6 server feature flag OFF-by-default; exact App digest in CI 40798972739 (five source-identity/startup fixture failures to rerun).
    '0b7c120c6b858a05941e00efc5d89478e10500af720ff7faf8e3668dafc12edb',
    // PR #75 integrated approved visual design with V3.6 owner preview OFF by default;
    // exact App build in CI #40900296254; Auth and Finance hashes unchanged.
    'd1618ca222afa4604cb6e1c5c938735c6415a0fc475b3901f5b04b3d9f0eb2f1',
    // PR79 original-reference component layout, verified charts and Hermes published cohort;
    // exact local build; full regression and review remain required, no deployment.
    '9e704d09411fa5a9db9cb6d1c2721314db6ffda92ab5edfc97b724329929a08a',
    // Local AI Sales owner preview and SKU/pricing observer integration, no deployment.
    'a5ba3298faf4b8c2eaa32e98674f1d7408f4c4616236d8f04a2fba72bbfb91c8',
    // Reviewed Live integration, durable owner drafts and PR85 cancellation refresh.
    'eea2f01c997b9e8012160862929abab8407a81dda44215c5aea8b2b9ef3a2ef6',
    '22b4ad40c6e7e331965dad976715d89ac8ef5f2e5c3e9e098282209296590796',
    'a1cea50f3481831781daab3caa0437cecee85494f6e6eb89e1f9b5e0d8b6790a',
    '6535b56d5a4548468a4af454c31e72642dd4353f56d8cb918ce902fff0f45bb9',
  ]}),
  auth: Object.freeze({name: 'brazacommerce-auth', main: '../../dist/auth-worker.mjs', baselineHashes: [
    'c63ee09b2d98b6321e3ae7feae1066a9eec9160b49868d72fb84cb0471a0018d',
    'cf326e9a4917c75474b4222c87cbf5744f98ddfe459eb1fd249a05fb6f097bcb',
    '45d0142709c5087e373cc4da146070ed39c472805f6f64c00f00b6555f0e1f56',
    'c55d2339b6e227b606e8a55b6cefcc904d95466f238b70f1d2aea74599dbdb7a',
    '28a43b7d610eda4b272a2a7013c7213f966976850f78be3cb0f767adeab3146d',
    'deabe5720315b771d3a5a487b460ea4307f18254a12a5208bc8f9ddc83e2b47f',
    '75ff27a2d7570fd99f5fea70372e83d4837b6a197a8b59626a7e6f2bec66ecdd',
    '0750e39f83bff4127dc967469100382d911da11fa122e030b0516f2d45185c2a',
    '1742d1be9d60ea4e03020e86d5ec52827115b8405a42f776ad614a4e28f04615',
    '5d9e70fe999d9cef0528bfa54d90aabd101089f4ccd6a8cc52925ea2e66bab01',
    'f81ad81c19147fba59bc3cce1767e49cabda27bb0c6bd69708ea19b7153c9227',
    '8edabdd130364fb021f7fa2a7c35f039ed7caaa0180999499ba6d802544092fe',
    '28237949fdf151da9cf668296745b8cf61b72b7c08807476648d19d42a01e3ab',
    '28d20322bc2fa193953567e9a0cbd45f0b0b77763ba856f2a705e69f57fba99c',
    '078c8515d13c46799c885b08d97615f7eb8501ea06ce0ba2fe22e218ea813726',
    'eb55225c13a4eeea273054f48256f5616d392207c45b4f562b399822d032006c',
    'ca770dd87faefbe8be786cb94f5762d971a18f262c7fd2f73a84298256555240',
    '22155d65d588c8f012f552d3a4bdb1153e0383894d1a5ccadfe2642ede9d79ac',
    '73634938376735f2d88cf94e03618b4b9f84d576b91877a6bc35b178c7724592',
    'c43f4191f560134c24ed9f700c8e0d29487c34f8a8a20fbed64c519d229eb4c9',
    '234fdd1fd6214621023eba06a2a5d8f78ce2b66a029b201359666104980ed911',
    '32b71da1f448d5e30d971e08f1ff094663c281f28ddefd8181fd92739d69dd39',
    'dfa7c147c4126e0875b9b82f94844e4165e89d0a06a4d9b172caa299df54b688',
    'e1a260b16cffb43896c05b2451046756b8a7c0fdad034cf940f41a8b91068519',
    'c5c0d5b705e486e2762fbe23214e342163638450169029dd21a691d2412dc682',
    'f9e0e2980fc9f9ebfa5b9935bc2f4617ef9816e6d07465351927df16b74b210b',
    '7c2f61c60b19c6a21618943a607b4332c63fac0f6c14998a530ec810f585fbf5',
    'f7ded1f5e95d993b9a71becb89db7ec38b45906a6a028c02e37db1cccf34e588',
    'e3040682f1db97222ddd1c0964f7c0ff01a4fb9c264a5bb35ff1a33d68b4edce',
    'd8ae5491948f08687c8892675b85ffea231f63f4baa46c4f7b372bcda91284d3',
    'c6b8fe797051c03506c65b912d619580c956771fdf0fd4afad05f8129e3b7429',
    'fb505f6f9f272999de48fe32f32221d089b125f47f16f7f1bc2222553d8051ee',
    'f677e2e6e710ce57cccf22dbc6009febc051f308790be3f010ae05ad8cb5ada0',
    '2f8e66d909d66a83df8dc10aba0280fb4103ba53be5c42c1ce257cd8a27aa1fb',
    '1fef431c8573e05563c7938d95be0976a160bc603340084aa747ee0b73e7ec64',
  ]}),
  finance: Object.freeze({name: 'brazacommerce-finance', main: '../../dist/finance-worker.mjs', baselineHashes: []}),
});
export const stableJson = value => JSON.stringify(value, null, 2) + '\n';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const error = code => Object.assign(new Error(code), {code});
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
