import { Check, Plus, Settings2, Tags, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Alert, Panel, Skeleton } from '../ui';
import {
  mediaError,
  useCreateTag,
  useDeleteTag,
  useProductMedia,
  useSetProductTags,
  useTags,
  useUpdateTag,
} from '../../lib/media-api';
import { slugify } from '../../lib/format';
import type { ProductTag } from '../../types/media';

type ProductTagPickerProps = { productId: string; productName: string; className?: string };

const sameSet = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((id) => right.includes(id));

/**
 * Picks the whole tag set for one product. The save is explicit rather than a
 * write per chip: the endpoint replaces the set, so a half-finished click-fest
 * would otherwise publish every intermediate state — and an admin clearing four
 * tags to pick two others would blank the product in between.
 */
export function ProductTagPicker({ productId, productName, className = '' }: ProductTagPickerProps) {
  const tags = useTags();
  const media = useProductMedia(productId);
  const save = useSetProductTags();
  const create = useCreateTag();
  const rename = useUpdateTag();
  const drop = useDeleteTag();

  // Null means "whatever the server says"; a draft only exists once the admin
  // touches a chip, so a background refetch never overwrites their work.
  const [draft, setDraft] = useState<string[] | null>(null);
  const [name, setName] = useState('');
  const [managing, setManaging] = useState(false);
  const [edits, setEdits] = useState<Record<string, { name: string; slug: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const applied = (media.data?.tags ?? []).map((tag) => tag.id);
  const selected = draft ?? applied;
  const dirty = draft !== null && !sameSet(draft, applied);
  const fail = (reason: unknown): void => {
    setSaved(false);
    setError(mediaError(reason));
  };

  function toggle(tagId: string): void {
    setSaved(false);
    setDraft(selected.includes(tagId) ? selected.filter((id) => id !== tagId) : [...selected, tagId]);
  }

  function submit(): void {
    setError(null);
    save.mutate(
      { productId, tagIds: selected },
      {
        onSuccess: () => {
          setDraft(null);
          setSaved(true);
        },
        onError: fail,
      },
    );
  }

  function addTag(event: FormEvent): void {
    event.preventDefault();
    const label = name.trim();
    const slug = slugify(label);
    if (!slug) {
      setError('Tên thẻ phải có ít nhất một chữ cái hoặc chữ số.');
      return;
    }
    setError(null);
    create.mutate(
      { name: label, slug },
      {
        // Selected but not saved: creating a label and attaching it to this
        // product are two different decisions, and the second one is a click away.
        onSuccess: (tag: ProductTag) => {
          setName('');
          setDraft([...selected, tag.id]);
        },
        onError: fail,
      },
    );
  }

  function saveTag(tag: ProductTag): void {
    const edit = edits[tag.id];
    if (!edit) return;
    const label = edit.name.trim();
    const slug = slugify(edit.slug);
    if (!label || !slug) {
      setError('Tên và slug của thẻ phải có ít nhất một chữ cái hoặc chữ số.');
      return;
    }
    setError(null);
    rename.mutate(
      { id: tag.id, name: label, slug },
      {
        onSuccess: () =>
          setEdits((current) => {
            const next = { ...current };
            delete next[tag.id];
            return next;
          }),
        onError: fail,
      },
    );
  }

  function deleteTag(tag: ProductTag): void {
    if (
      !window.confirm(
        `Xóa thẻ “${tag.name}” khỏi toàn bộ catalogue? Thẻ sẽ bị gỡ khỏi ${tag.productCount ?? 0} sản phẩm đang bán và mọi liên kết ?tags=${tag.slug} sẽ không còn khớp gì.`,
      )
    )
      return;
    setError(null);
    drop.mutate(tag.id, { onError: fail });
  }

  const busy = save.isPending || create.isPending || rename.isPending || drop.isPending;

  return (
    <Panel
      className={className}
      title="Thẻ sản phẩm"
      icon={Tags}
      action={
        <button
          className="btn-ghost btn-sm"
          onClick={() => setManaging((current) => !current)}
          type="button"
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden />
          {managing ? 'Xong' : 'Quản lý thẻ'}
        </button>
      }
    >
      {tags.isPending || media.isPending ? (
        <Skeleton className="h-24" />
      ) : tags.isError || media.isError ? (
        <Alert>Không tải được danh sách thẻ.</Alert>
      ) : (
        <>
          {!tags.data.length ? (
            <p className="text-sm text-slate-500">
              Chưa có thẻ nào. Tạo thẻ đầu tiên ở dưới rồi gán cho “{productName}”.
            </p>
          ) : managing ? (
            <ul className="space-y-2">
              {tags.data.map((tag) => {
                const edit = edits[tag.id] ?? { name: tag.name, slug: tag.slug };
                const changed = edit.name !== tag.name || edit.slug !== tag.slug;
                return (
                  <li className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 p-3" key={tag.id}>
                    <div className="min-w-[8rem] flex-1">
                      <label className="label text-xs" htmlFor={`tag-name-${tag.id}`}>
                        Tên
                      </label>
                      <input
                        className="field py-1.5 text-xs"
                        id={`tag-name-${tag.id}`}
                        onChange={(event) =>
                          setEdits((current) => ({ ...current, [tag.id]: { ...edit, name: event.target.value } }))
                        }
                        value={edit.name}
                      />
                    </div>
                    <div className="min-w-[8rem] flex-1">
                      <label className="label text-xs" htmlFor={`tag-slug-${tag.id}`}>
                        Slug
                      </label>
                      <input
                        className="field py-1.5 font-mono text-xs"
                        id={`tag-slug-${tag.id}`}
                        onChange={(event) =>
                          setEdits((current) => ({ ...current, [tag.id]: { ...edit, slug: event.target.value } }))
                        }
                        value={edit.slug}
                      />
                    </div>
                    <button
                      className="btn-secondary btn-sm"
                      disabled={busy || !changed}
                      onClick={() => saveTag(tag)}
                      type="button"
                    >
                      Lưu
                    </button>
                    <button
                      aria-label={`Xóa thẻ ${tag.name}`}
                      className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      disabled={busy}
                      onClick={() => deleteTag(tag)}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                );
              })}
              <li className="text-xs text-slate-400">
                Đổi tên không ảnh hưởng liên kết; đổi slug sẽ làm mọi liên kết{' '}
                <span className="font-mono">?tags=</span> đã lưu không còn khớp.
              </li>
            </ul>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.data.map((tag) => {
                const on = selected.includes(tag.id);
                return (
                  <button
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition-colors ${
                      on
                        ? 'bg-brand-600 text-white ring-brand-600'
                        : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                    disabled={busy}
                    key={tag.id}
                    onClick={() => toggle(tag.id)}
                    type="button"
                  >
                    {on && <Check className="h-3 w-3" aria-hidden />}
                    {tag.name}
                    <span className={`font-mono font-normal ${on ? 'text-white/70' : 'text-slate-400'}`}>
                      {tag.slug}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {!managing && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              <button className="btn-primary btn-sm" disabled={!dirty || busy} onClick={submit} type="button">
                {save.isPending ? 'Đang lưu...' : 'Lưu thẻ'}
              </button>
              {dirty && (
                <button className="btn-ghost btn-sm" disabled={busy} onClick={() => setDraft(null)} type="button">
                  Hoàn tác
                </button>
              )}
              <span className="text-xs text-slate-400">
                {dirty
                  ? `Chưa lưu: ${selected.length} thẻ sẽ thay thế toàn bộ thẻ hiện tại của sản phẩm.`
                  : `${applied.length} thẻ đang áp dụng. Bỏ chọn hết rồi lưu để xóa toàn bộ thẻ.`}
              </span>
            </div>
          )}

          <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={addTag}>
            <div className="min-w-[10rem] flex-1">
              <label className="label" htmlFor={`new-tag-${productId}`}>
                Tạo thẻ mới
              </label>
              <input
                className="field"
                id={`new-tag-${productId}`}
                onChange={(event) => setName(event.target.value)}
                placeholder="Bán chạy"
                value={name}
              />
            </div>
            <button className="btn-secondary" disabled={create.isPending || !name.trim()}>
              <Plus className="h-4 w-4" aria-hidden />
              Tạo thẻ
            </button>
            {name.trim() && (
              <p className="w-full text-xs text-slate-400">
                Slug: <span className="font-mono">{slugify(name) || '(không hợp lệ)'}</span> — thẻ mới
                sẽ được chọn sẵn, bấm “Lưu thẻ” để gán cho sản phẩm.
              </p>
            )}
          </form>

          {error && (
            <div className="mt-4">
              <Alert>{error}</Alert>
            </div>
          )}
          {saved && !error && (
            <div className="mt-4">
              <Alert tone="success">Đã cập nhật thẻ cho “{productName}”.</Alert>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
