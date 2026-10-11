/* ==================== حفظ الملفات وطباعتها ====================
   المتصفح على الحاسوب ينزّل الملف برابط مؤقّت، وهذا يكفيه. أما داخل
   تطبيق الهاتف فلا متصفح يستقبل الرابط، فالملف يذهب إلى الغلاف الأصلي
   ليكتبه في مجلّد التنزيلات ويفتحه بتطبيق الجداول.

   الجسر اختياري: إن لم يكن التطبيق هو الغلاف عاد كل شيء إلى السلوك
   الأصلي كما هو، فملف واحد يخدم الحاسوب والهاتف معاً.
   ============================================================== */

/** الغلاف الأصلي إن كنّا داخله، وإلا null. */
const native = () => (typeof window !== 'undefined' ? window.GreenCityNative ?? null : null);

export const inApp = () => native() !== null;

const toBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذّرت قراءة الملف'));
    // النتيجة data:<نوع>;base64,<البيانات> — نأخذ ما بعد الفاصلة
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(blob);
  });

/**
 * يحفظ محتوى إلى ملف باسمه. على الحاسوب تنزيل عادي، وعلى الهاتف يُكتب
 * في مجلّد التنزيلات ويُعرض إشعار بفتحه.
 */
export async function saveBlob(blob, filename) {
  const app = native();
  if (app?.saveFile) {
    try {
      app.saveFile(filename, await toBase64(blob), blob.type || 'application/octet-stream');
      return;
    } catch {
      /* تعذّر الجسر — نُكمل بالطريقة المعتادة بدل أن يخرج المستخدم بلا ملف */
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * يطبع صفحة مستقلّة (سند، وصل أمانة). على الحاسوب إطار مخفيّ يطبع نفسه،
 * وعلى الهاتف تذهب الصفحة إلى خدمة الطباعة في أندرويد.
 * يُرجع true إن تولّى الغلاف الأمر.
 */
export function printHtml(html) {
  const app = native();
  if (!app?.printHtml) return false;
  try {
    app.printHtml(html);
    return true;
  } catch {
    return false;
  }
}
