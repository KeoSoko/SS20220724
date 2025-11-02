
import React from 'react';
import { PageLayout } from '@/components/page-layout';
import { ScreenshotHelper } from '@/components/screenshot-helper';

export default function ScreenshotHelperPage() {
  return (
    <PageLayout 
      title="Screenshot Helper"
      subtitle="Capture app store screenshots for Simple Slips"
      showBackButton={true}
    >
      <ScreenshotHelper 
        onCapture={(screenshotName) => {
          console.log(`Captured screenshot: ${screenshotName}`);
        }}
      />
    </PageLayout>
  );
}
