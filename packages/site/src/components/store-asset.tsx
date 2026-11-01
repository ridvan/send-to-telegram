import { useParams, useSearch } from '@tanstack/react-router';

import { isStoreAsset, storeAssets } from '@/lib/store-assets';
import { StoreLook } from '@/lib/store-look';

export function StoreAsset() {
  const { asset } = useParams({ from: '/store/$asset' });
  const look = useSearch({ from: '/store/$asset' });

  if (!isStoreAsset(asset)) return null;

  const Asset = storeAssets[asset];

  return (
    <StoreLook value={look}>
      <Asset />
    </StoreLook>
  );
}
