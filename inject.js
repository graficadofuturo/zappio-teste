const fs = require('fs');
let code = fs.readFileSync('src/api/routes/mercadolivre.ts', 'utf8');

const injectionCode = `    let affiliateCookie = null;
    let affiliateTag = null;
    try {
      console.log("ML_CALLBACK_EXTRACT_AFFILIATE_START", { uid: userId });
      const lbRes = await fetch("https://www.mercadolivre.com.br/afiliados/linkbuilder", {
        headers: {
          "Authorization": \Bearer ${tokenData.access_token}\,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
        }
      });
      
      const setCookies = lbRes.headers.getSetCookie ? lbRes.headers.getSetCookie() : [];
      if (setCookies.length > 0) {
        affiliateCookie = setCookies.map(c => c.split(';')[0]).toin('; ');
      } else {
        const rawCookie = lbRes.headers.get("set-cookie");
        if (rawCookie) affiliateCookie = rawCookie;
      }
      
      const html = await lbRes.text();
      const tagMatches = [
        html.match(/"tag":"([^"]+)"/),
        html.match(/tag=([a-zA-Z0-9_\\-]+)/),
        html.match(/'tag'\\s*:\\s*'([^']+)'/),
        html.match(/tag\\s*:\\s*"([^"]+)"/),
        html.match(/"tag_id"\\s*)\\s*"[_"]+)"/,
        //match something like ".com.br/PAGE/?tag=XXXX���[�X]�
�Y�J�K^�KV�NW�WJ�K�JB�N�܈
�ۜ�X]�وY�X]�\�HY�
X]�	��X]��WJHY��[X]UY�HX]��WN��XZ�B�B��ۜ��K����S��S�P���V�P��Q��SPUW�ӑH��\�����YN�HXY��[X]P����YKYΈY��[X]UY�JNH�]�
\���[�JH�ۜ��K�\��܊�S��S�P���V�P��Q��SPUW�T��Ԉ�\��˛Y\��Y�JNX���HH��K��\X�J	��ۜ�]N�[�HH��X\��]X�N��Y\��Y�]��H�	�[��X�[ې��H
�	���ۜ�]N�[�HH��X\��]X�N��Y\��Y�]��H�	�N��ۜ��Y[�[��X�[ۈHY��[X]P����YN�Y��[X]P����YH�[�Y��[X]UYΈY��[X]UY��[�Y��[X]P����YT�]\Έ
Y��[X]P����YH	��Y��[X]UY�H��X�]�H���[�[�ȋ���HH��K��\X�J	���ۛ�X�Y]��]�]J
K��T����[��
K	�	���
��Y[�[��X�[ۈ
�	���ۛ�X�Y]��]�]J
K��T����[��
K	�N��˝ܚ]Q�[T�[��	�ܘ��\Kܛ�]\��Y\��Y�]��K�����JN�ۜ��K���	��X��\�ٝ[H[��X�Y[���[�X���N