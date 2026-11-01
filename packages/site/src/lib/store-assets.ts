import {
  ConnectSlide,
  DetailsSlide,
  HeroSlide,
  Marquee,
  PopupSlide,
  RightClickSlide,
  SmallTile,
} from '@/components/store-slides';

/** Each store picture by the name its page and file use. */
export const storeAssets = {
  'screenshot-1': HeroSlide,
  'screenshot-2': RightClickSlide,
  'screenshot-3': PopupSlide,
  'screenshot-4': ConnectSlide,
  'screenshot-5': DetailsSlide,
  'small-tile': SmallTile,
  marquee: Marquee,
} as const;

export type StoreAssetName = keyof typeof storeAssets;

export function isStoreAsset(name: string): name is StoreAssetName {
  return Object.hasOwn(storeAssets, name);
}
