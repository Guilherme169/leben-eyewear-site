# Provador virtual Leben

- `js/provador.js`: o provador (câmera, rastreamento facial, desenho da armação, foto e compartilhamento).
- `vto/engine/`: MediaPipe Face Landmarker (Google, licença Apache-2.0), hospedado aqui para não depender de terceiros.
- `vto/frames/`: armações recortadas (PNG/WebP com fundo transparente, sem hastes) + máscara das lentes.
- `vto/frames.json`: cadastro das armações do provador.

Campos de cada armação: `lc`/`rc` = centro das lentes (px na imagem), `lh` = altura média da lente (px),
`dbc` = distância entre os centros das lentes em mm (largura da lente + ponte; ex.: 53□17 → 70).
Ao receber as medidas reais de cada peça, atualize `dbc` — o tamanho no rosto passa a ser exato.

Para incluir uma armação nova: foto frontal reta, hastes abertas, fundo liso → recorte → entrada no frames.json.
