'use client'

import { Trash2 } from 'lucide-react'

export function ContentDeleteButton({ action }: { action: string }) {
  return (
    <form
      action={action}
      method="POST"
      className="inline"
      onSubmit={(e) => {
        if (!confirm('Are you sure you want to delete this content?')) {
          e.preventDefault()
        }
      }}
    >
      <button
        type="submit"
        className="p-2 rounded-lg hover:bg-[#8DEBFF]/15 text-[#A9B8C6] hover:text-[#8DEBFF] transition-colors"
        title="Delete"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </form>
  )
}
