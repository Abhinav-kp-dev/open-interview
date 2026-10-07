import React from "react"
import ScreenshotItem from "./ScreenshotItem"

interface Screenshot {
  path: string
  preview: string
}

interface ScreenshotQueueProps {
  isLoading: boolean
  screenshots: Screenshot[]
  onDeleteScreenshot: (index: number) => void
}
const ScreenshotQueue: React.FC<ScreenshotQueueProps> = ({
  isLoading,
  screenshots,
  onDeleteScreenshot
}) => {
  if (screenshots.length === 0) {
    return <></>
  }

  const displayScreenshots = screenshots.slice(0, 5)

  return (
    <div className="flex w-full justify-center">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(96px,96px))] justify-center gap-2.5">
        {displayScreenshots.map((screenshot, index) => (
          <ScreenshotItem
            key={screenshot.path}
            isLoading={isLoading}
            screenshot={screenshot}
            index={index}
            onDelete={onDeleteScreenshot}
          />
        ))}
      </div>
    </div>
  )
}

export default ScreenshotQueue
