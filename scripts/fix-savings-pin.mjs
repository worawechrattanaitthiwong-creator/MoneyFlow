import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = join(root, 'public', 'index.html');
let html = await readFile(indexPath, 'utf8');

if (!html.includes('MONEYFLOW_SAVINGS_PIN_FIX_V1')) {
  const patch = `
<script>
/* MONEYFLOW_SAVINGS_PIN_FIX_V1
   Always confirm PIN state from D1 before showing setup/change UI.
   If backend detects an existing PIN while UI was stale, switch to change mode
   and expose the current-PIN field instead of leaving the user stuck.
*/
(function(){
  function pinErrorMessage(error){
    return String((error && error.message) || error || 'เกิดข้อผิดพลาด');
  }

  function refreshPinStatusThen(openMode){
    google.script.run
      .withSuccessHandler(function(status){
        SAVINGS_PIN_STATUS = {loaded:true,hasPin:!!(status && status.hasPin)};
        openSavingsPinModal(SAVINGS_PIN_STATUS.hasPin ? (openMode || 'change') : 'setup');
        if (typeof saveLocalSnapshot === 'function') saveLocalSnapshot();
      })
      .withFailureHandler(serverError)
      .getSavingsSecurityStatus(TOKEN);
  }

  openSavingsPinSettings = function(){
    // Never trust a cached false here: the server may already have a PIN.
    refreshPinStatusThen('change');
  };

  openSavingsPinForReveal = function(){
    google.script.run
      .withSuccessHandler(function(status){
        SAVINGS_PIN_STATUS = {loaded:true,hasPin:!!(status && status.hasPin)};
        openSavingsPinModal(SAVINGS_PIN_STATUS.hasPin ? 'verify' : 'setup');
      })
      .withFailureHandler(serverError)
      .getSavingsSecurityStatus(TOKEN);
  };

  requestSavingsMaskToggle = function(){
    if (!SAVINGS_MASK_ALL) {
      SAVINGS_UNLOCKED_UNTIL=0;
      applySavingsMask(true);
      toast('ซ่อนยอดแล้ว','info');
      saveLocalSnapshot();
      return;
    }
    if (Date.now()<SAVINGS_UNLOCKED_UNTIL) {
      applySavingsMask(false);
      return;
    }
    openSavingsPinForReveal();
  };

  submitSavingsPinModal = function(){
    const pin = String(el('savingsPinValue').value || '').trim();
    if (!/^\\d{4,6}$/.test(pin)) {
      toast('PIN ต้องเป็นตัวเลข 4-6 หลัก','warning');
      return;
    }

    if (SAVINGS_PIN_MODE === 'verify') {
      const pinBtn=el('savingsPinSubmitBtn');
      pinBtn.disabled=true;
      pinBtn.textContent='กำลังตรวจสอบ...';
      google.script.run
        .withSuccessHandler(function(result){
          pinBtn.disabled=false;
          pinBtn.textContent='เปิดดูยอด';
          if (!result || !result.success) {
            toast((result && result.message) || 'PIN ไม่ถูกต้อง','error');
            return;
          }
          SAVINGS_UNLOCKED_UNTIL = Date.now() + 5*60*1000;
          closeSavingsPinModal();
          applySavingsMask(false);
          saveLocalSnapshot();
          toast('เปิดดูยอดแล้ว','success');
        })
        .withFailureHandler(function(err){
          pinBtn.disabled=false;
          pinBtn.textContent='เปิดดูยอด';
          serverError(err);
        })
        .verifySavingsPin(TOKEN,pin);
      return;
    }

    const confirmPin = String(el('savingsPinConfirm').value || '').trim();
    if (pin !== confirmPin) {
      toast('PIN ใหม่ทั้งสองช่องไม่ตรงกัน','warning');
      return;
    }

    const currentPin = SAVINGS_PIN_MODE === 'change'
      ? String(el('savingsCurrentPin').value || '').trim()
      : '';

    if (SAVINGS_PIN_MODE === 'change' && !/^\\d{4,6}$/.test(currentPin)) {
      toast('กรุณาใส่ PIN เดิม 4-6 หลัก','warning');
      if (el('savingsCurrentPin')) el('savingsCurrentPin').focus();
      return;
    }

    const pinBtn=el('savingsPinSubmitBtn');
    pinBtn.disabled=true;
    pinBtn.textContent='กำลังบันทึก...';

    google.script.run
      .withSuccessHandler(function(){
        pinBtn.disabled=false;
        SAVINGS_PIN_STATUS = {loaded:true,hasPin:true};
        saveLocalSnapshot();
        SAVINGS_UNLOCKED_UNTIL = Date.now() + 5*60*1000;
        closeSavingsPinModal();
        applySavingsMask(false);
        toast(SAVINGS_PIN_MODE === 'change' ? 'เปลี่ยน PIN แล้ว' : 'ตั้ง PIN แล้ว','success');
      })
      .withFailureHandler(function(err){
        pinBtn.disabled=false;
        pinBtn.textContent='บันทึก PIN';
        const message = pinErrorMessage(err);
        if (message.includes('PIN เดิมไม่ถูกต้อง')) {
          // Backend has a PIN although the UI thought this was first-time setup.
          SAVINGS_PIN_STATUS = {loaded:true,hasPin:true};
          openSavingsPinModal('change');
          toast('ระบบพบว่ามี PIN อยู่แล้ว กรุณาใส่ PIN เดิมก่อนตั้ง PIN ใหม่','warning');
          return;
        }
        serverError(err);
      })
      .setSavingsPin(TOKEN,{currentPin:currentPin,newPin:pin});
  };
})();
</script>`;

  if (!html.includes('</body>')) throw new Error('Generated index has no </body>');
  html = html.replace('</body>', patch + '\n</body>');
  await writeFile(indexPath, html);
}

console.log('Applied MoneyFlow savings PIN UI/state fix');
