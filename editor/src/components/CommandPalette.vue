<script setup lang="ts">
// ---------- Ctrl+K command palette ----------
// Renders the SAME registry that drives the header, grouped by CommandGroup.
// Selecting an entry runs its command and closes the dialog.
import { computed } from 'vue'
import { Check } from '@lucide/vue'
import { useI18n } from '../i18n.ts'
import { useCommands, type CommandDef, type CommandGroupId } from '../commands.ts'
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut } from '../components/ui/command'

const { t } = useI18n()
const { groups, commands } = useCommands()

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

// Commands visible right now (reacts to chunk mode, token availability, etc.).
const visible = computed<CommandDef[]>(() => commands.value.filter((c) => c.visibleWhen?.() ?? true))

const visibleGroups = computed(() =>
  groups.filter((g) => visible.value.some((c) => c.group === g.id))
)

const commandsIn = (groupId: CommandGroupId): CommandDef[] => visible.value.filter((c) => c.group === groupId)

function run(cmd: CommandDef): void {
  cmd.run()
  emit('update:open', false)
}
</script>

<template>
  <CommandDialog
    :open="props.open"
    @update:open="emit('update:open', $event)"
  >
    <CommandInput :placeholder="t('palette.placeholder')" />
    <CommandList>
      <CommandEmpty>{{ t('palette.empty') }}</CommandEmpty>
      <CommandGroup v-for="g in visibleGroups" :key="g.id" :heading="t(g.titleKey)">
        <CommandItem
          v-for="c in commandsIn(g.id)"
          :key="c.id"
          :value="c.id"
          :disabled="c.disabled?.()"
          @select="run(c)"
        >
          <component :is="c.icon" class="size-4" />
          <span class="truncate">{{ t(c.titleKey, c.params) }}</span>
          <Check v-if="c.active?.()" class="ml-auto size-4 text-foreground" />
          <CommandShortcut v-if="c.shortcut">{{ c.shortcut }}</CommandShortcut>
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </CommandDialog>
</template>