import { Card, CardBody } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { ChipInput, TextArea, TextInput } from '@/components/ui/Field'
import { SectionLabel } from '@/components/ui/states'
import type { BuddyProfileInput } from '@/data'
import type { BuddyProfile, SweetOrSavoury } from '@/lib/types'

const SNACK_IDEAS = ['Crisps', 'Chocolate', 'Percy Pigs', 'Fruit', 'Biscuits', 'Nuts']
const SHOP_IDEAS = ['M&S', 'Amazon', 'Waterstones', 'Lush', 'Oliver Bonas']
const INTEREST_IDEAS = ['Plants', 'Football', 'Baking', 'Running', 'Music', 'Reading', 'Gaming']
const COLOUR_IDEAS = ['Green', 'Blue', 'Lilac', 'Orange', 'Pink', 'Yellow']
const DIET_IDEAS = ['Vegetarian', 'Vegan', 'No nuts', 'Gluten-free', 'Dairy-free', 'Halal']

const SWEET_OPTIONS: { value: SweetOrSavoury; label: string }[] = [
  { value: 'sweet', label: 'Sweet' },
  { value: 'savoury', label: 'Savoury' },
  { value: 'both', label: 'Both!' },
]

export function toInput(name: string, bp: BuddyProfile | null): BuddyProfileInput {
  return {
    preferred_name: bp?.preferred_name || name,
    birthday: bp?.birthday ?? null,
    drink: bp?.drink ?? '',
    sweet_or_savoury: bp?.sweet_or_savoury ?? null,
    favourite_snacks: bp?.favourite_snacks ?? [],
    favourite_shops: bp?.favourite_shops ?? [],
    interests: bp?.interests ?? [],
    favourite_colours: bp?.favourite_colours ?? [],
    little_things: bp?.little_things ?? '',
    dislikes: bp?.dislikes ?? [],
    dietary_requirements: bp?.dietary_requirements ?? [],
    free_text: bp?.free_text ?? '',
  }
}

interface BuddyProfileFormProps {
  value: BuddyProfileInput
  onChange: (next: BuddyProfileInput) => void
}

/** The sectioned buddy-profile editor. Chips everywhere, free text always allowed. */
export function BuddyProfileForm({ value, onChange }: BuddyProfileFormProps) {
  const set = <K extends keyof BuddyProfileInput>(key: K, v: BuddyProfileInput[K]) =>
    onChange({ ...value, [key]: v })

  return (
    <div className="space-y-4">
      {/* Your favourites */}
      <Card tone="cream">
        <CardBody className="space-y-4">
          <div>
            <SectionLabel>Your favourites</SectionLabel>
            <h3 className="font-display text-xl text-ink">The little treats</h3>
          </div>
          <TextInput
            label="Coffee / tea / drink"
            placeholder="e.g. Flat white, oat milk"
            value={value.drink}
            onChange={(e) => set('drink', e.target.value)}
          />
          <div className="space-y-1.5">
            <span className="text-sm font-semibold text-ink">Sweet or savoury?</span>
            <div className="flex gap-2">
              {SWEET_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  selected={value.sweet_or_savoury === o.value}
                  onToggle={() =>
                    set('sweet_or_savoury', value.sweet_or_savoury === o.value ? null : o.value)
                  }
                />
              ))}
            </div>
          </div>
          <ChipInput
            label="Favourite snacks"
            optional
            values={value.favourite_snacks}
            onChange={(v) => set('favourite_snacks', v)}
            suggestions={SNACK_IDEAS}
          />
          <ChipInput
            label="Favourite shops"
            optional
            values={value.favourite_shops}
            onChange={(v) => set('favourite_shops', v)}
            suggestions={SHOP_IDEAS}
          />
        </CardBody>
      </Card>

      {/* Things you're into */}
      <Card tone="lilac">
        <CardBody className="space-y-4">
          <div>
            <SectionLabel>Things you’re into</SectionLabel>
            <h3 className="font-display text-xl text-ink">Your world</h3>
          </div>
          <ChipInput
            label="Interests, teams & hobbies"
            values={value.interests}
            onChange={(v) => set('interests', v)}
            suggestions={INTEREST_IDEAS}
          />
          <ChipInput
            label="Favourite colours"
            optional
            values={value.favourite_colours}
            onChange={(v) => set('favourite_colours', v)}
            suggestions={COLOUR_IDEAS}
          />
        </CardBody>
      </Card>

      {/* Little things */}
      <Card tone="yolk">
        <CardBody className="space-y-3">
          <div>
            <SectionLabel>Little things</SectionLabel>
            <h3 className="font-display text-xl text-ink">Little things I’d love…</h3>
          </div>
          <TextArea
            value={value.little_things}
            onChange={(e) => set('little_things', e.target.value)}
            placeholder="Nice pens, surprise coffees, Percy Pigs, silly desk decorations…"
            maxLength={280}
            showCount
          />
        </CardBody>
      </Card>

      {/* Please don't */}
      <Card tone="coral">
        <CardBody className="space-y-4">
          <div>
            <SectionLabel>Please don’t</SectionLabel>
            <h3 className="font-display text-xl text-ink">The no-gos</h3>
          </div>
          <ChipInput
            label="Dislikes"
            optional
            values={value.dislikes}
            onChange={(v) => set('dislikes', v)}
            placeholder="e.g. Turkish Delight"
          />
          <ChipInput
            label="Dietary needs & allergies"
            optional
            hint="Important for anything edible."
            values={value.dietary_requirements}
            onChange={(v) => set('dietary_requirements', v)}
            suggestions={DIET_IDEAS}
          />
        </CardBody>
      </Card>

      {/* Anything else */}
      <Card tone="sage">
        <CardBody className="space-y-3">
          <div>
            <SectionLabel>Anything else?</SectionLabel>
            <h3 className="font-display text-xl text-ink">Something that would make my day…</h3>
          </div>
          <TextArea
            value={value.free_text}
            onChange={(e) => set('free_text', e.target.value)}
            placeholder="Anything at all that would make you smile."
            maxLength={280}
            showCount
          />
        </CardBody>
      </Card>
    </div>
  )
}
