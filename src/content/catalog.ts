import { developmentContent, productionContent } from '../generated/content';
import { developmentAssetModules, productionAssetModules } from '../generated/assets';
import { GameError, parseStory, type Story } from '../engine/story';
import {
  sceneBackgroundAsset,
  parsePresentationPackage,
  type PresentationPackage,
} from './presentation-package';
import type { ImageSourcePropType } from 'react-native';

export interface Release {
  story: Story;
  presentation: PresentationPackage;
  assetModules: Record<string, ImageSourcePropType>;
  hash: string;
  developmentOnly: boolean;
  showInLibrary: boolean;
}
export function createCatalog(isDevelopment: boolean): Release[] {
  const assetModules = isDevelopment ? developmentAssetModules : productionAssetModules;
  return (isDevelopment ? developmentContent : productionContent).map(entry => {
    const story = parseStory(entry.story);
    return {
      ...entry,
      story,
      presentation: parsePresentationPackage(entry.presentation, story),
      assetModules,
    };
  });
}
export function findRelease(catalog: Release[], storyId: string, version: number) {
  const release = catalog.find(entry => entry.story.storyId === storyId && entry.story.version === version);
  if (!release) throw new GameError('incompatible_content');
  return release;
}
export function latestReleases(catalog: Release[]) {
  const result = new Map<string, Release>();
  for (const entry of catalog) {
    if ((result.get(entry.story.storyId)?.story.version ?? 0) < entry.story.version) result.set(entry.story.storyId, entry);
  }
  return [...result.values()];
}
export function libraryReleases(catalog: Release[]) {
  return latestReleases(catalog.filter(release => release.showInLibrary));
}

export function presentationAssetSource(release: Release, assetId: string): ImageSourcePropType | undefined {
  return release.assetModules[`${release.story.storyId}@${release.story.version}:${assetId}`];
}

export function sceneBackgroundSource(release: Release, sceneId: string): ImageSourcePropType | undefined {
  const asset = sceneBackgroundAsset(release.presentation, sceneId);
  return asset ? presentationAssetSource(release, asset.id) : undefined;
}
