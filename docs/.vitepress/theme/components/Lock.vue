<template>
  <div v-if="html" class="vp-doc encrypted-article" v-html="html"></div>
  <div v-else class="lock-gate">
    <div class="lock-card">
      <div class="lock-icon" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <h2 class="lock-title">此文章已加密</h2>
      <p class="lock-subtitle">输入密码查看全文</p>
      <form class="lock-form" @submit.prevent="unlock">
        <input
          v-model="password"
          ref="inputRef"
          class="lock-input"
          type="password"
          placeholder="请输入密码"
          autocomplete="off"
          :disabled="loading"
        />
        <button class="lock-btn" type="submit" :disabled="loading || !password">
          {{ loading ? '解密中…' : '解锁' }}
        </button>
      </form>
      <p v-if="error" class="lock-error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({
  cipher: { type: String, required: true },
})

const password = ref('')
const html = ref('')
const error = ref('')
const loading = ref(false)
const inputRef = ref(null)

onMounted(() => inputRef.value?.focus())

function b64ToBytes(b64) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function unlock() {
  error.value = ''
  loading.value = true
  try {
    const meta = JSON.parse(atob(props.cipher))
    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password.value),
      'PBKDF2',
      false,
      ['deriveKey'],
    )
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64ToBytes(meta.salt), iterations: meta.iter, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    )
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(meta.iv) },
      key,
      b64ToBytes(meta.ct),
    )
    html.value = new TextDecoder().decode(plain)
  } catch {
    error.value = '密码错误，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.lock-gate {
  display: flex;
  justify-content: center;
  padding: 4rem 0 6rem;
}

.lock-card {
  width: 100%;
  max-width: 400px;
  text-align: center;
  padding: 2.75rem 2.25rem 2.5rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  background: var(--vp-c-bg-soft);
  box-shadow: 0 16px 40px -24px rgba(0, 0, 0, 0.25);
}

.lock-icon {
  width: 60px;
  height: 60px;
  margin: 0 auto 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--vp-c-brand-2) 22%, transparent);
}

.lock-icon svg {
  width: 26px;
  height: 26px;
}

.lock-title {
  margin: 0 0 0.4rem;
  font-family: var(--font-serif, 'Noto Serif SC', serif);
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--vp-c-text-1);
  border: none;
  padding: 0;
}

.lock-subtitle {
  margin: 0 0 0.75rem;
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
  letter-spacing: 0.03em;
}

.lock-card::after {
  content: "";
  display: block;
  width: 48px;
  height: 1px;
  margin: 1.5rem auto 1.75rem;
  background: linear-gradient(90deg, transparent, var(--vp-c-brand-2), transparent);
}

.lock-form {
  display: flex;
  gap: 0.5rem;
}

.lock-input {
  flex: 1;
  min-width: 0;
  height: 40px;
  padding: 0 0.9rem;
  font-size: 0.9375rem;
  font-family: inherit;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  outline: none;
  transition: border-color 0.25s, box-shadow 0.25s;
}

.lock-input:focus {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 3px var(--vp-c-brand-soft);
}

.lock-btn {
  height: 40px;
  padding: 0 1.4rem;
  font-size: 0.9375rem;
  font-weight: 500;
  letter-spacing: 0.05em;
  color: var(--vp-button-brand-text, var(--vp-c-bg));
  background: var(--vp-button-brand-bg, var(--vp-c-brand-1));
  border: none;
  border-radius: 999px;
  cursor: pointer;
  transition: background-color 0.25s, transform 0.25s;
}

.lock-btn:hover:not(:disabled) {
  color: var(--vp-button-brand-hover-text, var(--vp-c-bg));
  background: var(--vp-button-brand-hover-bg, var(--vp-c-brand-2));
  transform: translateY(-1px);
}

.lock-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.lock-error {
  margin: 1rem 0 0;
  font-size: 0.875rem;
  color: var(--vp-c-danger-1);
}
</style>
