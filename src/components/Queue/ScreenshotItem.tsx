// src/components/ScreenshotItem.tsx
import React from "react"
import { X } from "lucide-react"

interface Screenshot {
  path: string
  preview: string
}

interface ScreenshotItemProps {
  screenshot: Screenshot
  onDelete: (index: number) => void
  index: number
  isLoading: boolean
}

const ScreenshotItem: React.FC<ScreenshotItemProps> = ({
  screenshot,
  onDelete,
  index,
  isLoading
}) => {
  const handleDelete = async () => {
    await onDelete(index)
  }

  return (
    <div
      className={`relative aspect-[16/9] max-h-[92px] overflow-hidden rounded-[1rem] border border-white/10 bg-white/[0.04] shadow-[0_12px_28px_rgba(0,0,0,0.24)] ${
        isLoading ? "" : "group"
      }`}
    >
      <div className="relative h-full w-full">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            </div>
          )}
          <img
            src={screenshot.preview}
            alt="Screenshot"
            className={`h-full w-full object-cover transition-transform duration-300 ${
              isLoading
                ? "opacity-50"
                : "cursor-pointer group-hover:scale-[1.03] group-hover:brightness-75"
            }`}
          />
      </div>
      {!isLoading && (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/65 to-transparent" />
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleDelete()
            }}
            className="absolute left-2 top-2 rounded-full border border-white/15 bg-black/55 p-1 text-white opacity-100 transition hover:bg-black/80 sm:opacity-0 sm:group-hover:opacity-100"
            aria-label="Delete screenshot"
          >
            <X size={12} />
          </button>
        </>
      )}
    </div>
  )
}

export default ScreenshotItem
