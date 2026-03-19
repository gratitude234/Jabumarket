'use client';

// components/vendor/FoodOrderCTA.tsx
// Client component for the "Order Food" CTA on vendor pages

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UtensilsCrossed, Clock } from 'lucide-react';
import MealBuilder from '@/components/chat/MealBuilder';
import { isOpenNow, type DayEntry } from '@/lib/vendorSchedule';

type Props = {
  vendorId: string;
  vendorName: string;
  description?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
  acceptsOrders: boolean;
  daySchedule?: DayEntry[] | null;
};

function formatHour(time: string | null | undefined): string {
  if (!time) return '';
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const minute = m ?? '00';
  const suffix = hour >= 12 ? 'pm' : 'am';
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return minute === '00' ? `${display}${suffix}` : `${display}:${minute}${suffix}`;
}

export default function FoodOrderCTA({
  vendorId,
  vendorName,
  description,
  opensAt,
  closesAt,
  acceptsOrders,
  daySchedule,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showMealBuilder, setShowMealBuilder] = useState(false);

  // Auto-open meal builder if ?order=true
  useEffect(() => {
    if (searchParams.get('order') === 'true' && acceptsOrders) {
      setShowMealBuilder(true);
    }
  }, [searchParams, acceptsOrders]);

  const hours =
    opensAt && closesAt
      ? `${formatHour(opensAt)} – ${formatHour(closesAt)}`
      : null;

  // Use shared isOpenNow — respects day_schedule if present
  const open = acceptsOrders
    ? isOpenNow({ opens_at: opensAt, closes_at: closesAt, day_schedule: daySchedule })
    : false;

  return (
    <div className="space-y-3">
      {/* Food vendor info */}
      <div className="rounded-2xl border bg-zinc-50 p-3 space-y-2">
        {description && (
          <p className="text-sm text-zinc-600">{description}</p>
        )}
        {hours && (
          <p className="flex items-center gap-1 text-xs text-zinc-500">
            <Clock className="h-3.5 w-3.5" />
            {hours}
          </p>
        )}
      </div>

      {/* CTA */}
      {open !== false ? (
        <button
          type="button"
          onClick={() => setShowMealBuilder(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700"
        >
          <UtensilsCrossed className="h-4 w-4" />
          Order Food from {vendorName}
        </button>
      ) : (
        <div className="flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-400">
          <UtensilsCrossed className="h-4 w-4" />
          {!acceptsOrders ? 'Currently not accepting orders' : 'Closed right now'}
        </div>
      )}

      {/* Meal Builder */}
      {showMealBuilder && (
        <MealBuilder
          vendorId={vendorId}
          vendorName={vendorName}
          onClose={() => setShowMealBuilder(false)}
          onOrderSent={() => {
            router.push('/my-orders');
          }}
        />
      )}
    </div>
  );
}