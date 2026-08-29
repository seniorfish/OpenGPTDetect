<script setup lang="ts">
// ---------- Toast host ----------
import { useToastState } from '../composables/useToasts.ts'

const toastState = useToastState()
</script>

<template>
  <div
    id="toast"
    class="toast"
    :class="toastState.type"
    :style="{ display: toastState.visible ? 'block' : 'none' }"
  >
    {{ toastState.msg }}
  </div>
</template>