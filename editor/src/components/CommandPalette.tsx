// ---------- Ctrl+K command palette ----------
// Renders the SAME registry that drives the header, grouped by CommandGroup.
// Selecting an entry runs its command and closes the dialog.
import { Check } from 'lucide-react'
import { useI18n } from '@/i18n.ts'
import { useCommands, type CommandDef } from '@/commands.ts'
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut } from '@/components/ui/command'

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { t } = useI18n()
  const { groups, commands } = useCommands()

  const visible = commands.filter((c) => c.visibleWhen ?? true)
  const visibleGroups = groups.filter((g) => visible.some((c) => c.group === g.id))

  function run(cmd: CommandDef): void {
    cmd.run()
    onOpenChange(false)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t('palette.placeholder')} />
      <CommandList>
        <CommandEmpty>{t('palette.empty')}</CommandEmpty>
        {visibleGroups.map((g) => (
          <CommandGroup key={g.id} heading={t(g.titleKey)}>
            {visible
              .filter((c) => c.group === g.id)
              .map((c) => {
                const Icon = c.icon
                return (
                  <CommandItem
                    key={c.id}
                    value={`${c.id} ${t(c.titleKey, c.params)} ${c.keywords.join(' ')}`}
                    disabled={c.disabled}
                    onSelect={() => run(c)}
                  >
                    <Icon className="size-4" />
                    <span className="truncate">{t(c.titleKey, c.params)}</span>
                    {c.active && <Check className="ml-auto size-4 text-foreground" />}
                    {c.shortcut && <CommandShortcut>{c.shortcut}</CommandShortcut>}
                  </CommandItem>
                )
              })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}