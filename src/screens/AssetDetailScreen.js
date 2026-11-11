import React, { useCallback, useLayoutEffect, useState } from 'react';
import { View, Text, Pressable, Platform, Linking } from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { Screen, Card, SectionHeader, IconTile, Pill, Button, Segmented, haptic } from '../components/ui';
import { Donut } from '../components/charts';
import { Loading } from '../components/rows';
import { getAsset, getAssetExpenses, getAssetIncomes, groupSum, updateStatus, deleteAsset, undoSale, getSettings } from '../db/repo';
import useFocusData from '../utils/useFocusData';
import { confirm } from '../utils/confirm';
import { smoothLayout, assetSubtitle } from '../components/AssetCard';
import { ASSET_TYPES, STATUSES, STATUS_FLOW, PLANS, PHASES, PHASE_LIST, categoryIcon } from '../constants';
import { money, moneyShort, percent, prettyDate, monthLabel } from '../utils/format';

export default function AssetDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const { c, type, chart } = useTheme();
  const [by, setBy] = useState('phase');
  const headerHeight = useHeaderHeight();
  const [data, reload] = useFocusData(async () => {
    const asset = await getAsset(id);
    if (!asset) return { missing: true };
    return { asset, expenses: await getAssetExpenses(id), incomes: await getAssetIncomes(id), settings: await getSettings() };
  }, [id]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('AssetForm', { id })} hitSlop={10}>
          <Text style={{ color: c.blue, fontSize: 17 }}>Edit</Text>
        </Pressable>
      ),
    });
  }, [navigation, id, c.blue]);

  if (!data) return <Loading />;
  if (data.missing) return <Screen title="Not found" />;

  const { asset: a, expenses, incomes, settings } = data;
  const t = ASSET_TYPES[a.type];
  const sold = a.status === 'Sold';
  const rent = a.deal_type === 'Rent';
  const renting = rent && !sold;
  const result = sold ? a.profit : renting ? a.net_rent : a.expected_profit;
  const resultColor = result === null ? c.text : result >= 0 ? c.green : c.red;
  const over = !rent && a.expense_ratio >= settings.alert_percent;
  const steps = [...STATUS_FLOW[a.deal_type], ...(rent && sold ? ['Sold'] : [])];

  const phaseGroups = PHASE_LIST.map((p) => {
    const items = expenses.filter((e) => e.phase === p);
    return { phase: p, items, total: items.reduce((s, e) => s + e.amount, 0) };
  }).filter((g) => g.items.length);

  const pie = by === 'phase'
    ? phaseGroups.map((g) => ({ label: g.phase, value: g.total, color: c[PHASES[g.phase].color] }))
    : groupSum(expenses, 'category').map((x, i) => ({ ...x, color: chart(i) }));

  const setStatus = async (s) => {
    if (s === a.status) return;
    if (s === 'Sold') return navigation.navigate('SellAsset', { id });
    if (sold) {
      const ok = await confirm('Undo sale?', 'This removes the sale price, buyer and date.', { okText: 'Undo sale', destructive: true });
      if (!ok) return;
      await undoSale(id);
    }
    haptic.tap();
    await updateStatus(id, s);
    smoothLayout();
    reload();
  };

  const remove = async () => {
    const ok = await confirm('Delete asset?', `${a.identifier} and its ${expenses.length} expenses will be removed.`, { okText: 'Delete', destructive: true });
    if (!ok) return;
    await deleteAsset(id);
    navigation.goBack();
  };

  // Running total, oldest first, shown in the timeline
  let running = a.purchase_price;
  const runningById = {};
  [...expenses].reverse().forEach((e) => { running += e.amount; runningById[e.id] = running; });

  return (
    <Screen>
      <View style={{ paddingTop: Platform.OS === 'ios' ? headerHeight + 8 : 16, paddingHorizontal: 20 }}>
        <IconTile name={t.icon} color={c[t.color]} size={56} />
        <Text style={[type.caption, { color: c.text2, marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600' }]}>
          {a.type} · {PLANS[a.deal_type].long}
        </Text>
        <Text style={[type.title1, { color: c.text, marginTop: 2 }]}>{a.identifier}</Text>
        <Text style={[type.subhead, { color: c.text2, marginTop: 2 }]}>{[assetSubtitle(a), a.city].filter(Boolean).join(' · ')}</Text>
      </View>

      {/* Lifecycle */}
      <View style={{ flexDirection: 'row', marginHorizontal: 16, marginTop: 18, backgroundColor: c.card, borderRadius: 16, padding: 6, gap: 4 }}>
        {steps.map((s, i) => {
          const idx = steps.indexOf(a.status);
          const active = s === a.status;
          const done = i < idx;
          const col = c[STATUSES[s].color];
          return (
            <Pressable key={s} onPress={() => setStatus(s)} style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 12, backgroundColor: active ? col : 'transparent' }}>
              <Ionicons name={done ? 'checkmark-circle' : STATUSES[s].icon} size={18} color={active ? '#fff' : done ? col : c.text3} />
              <Text style={{ fontSize: 11, fontWeight: '600', marginTop: 3, color: active ? '#fff' : done ? c.text : c.text2 }} numberOfLines={1}>{s}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Rental card */}
      {renting ? (
        <Card style={{ marginHorizontal: 16, marginTop: 12 }}>
          <Text style={[type.footnote, { color: c.text2, fontWeight: '600' }]}>Net earned from rent</Text>
          <Text style={[type.numberXL, { color: resultColor }]} numberOfLines={1} adjustsFontSizeToFit>{money(a.net_rent, { sign: true })}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            {a.rent_amount ? <Pill label={`${moneyShort(a.rent_amount)} / month`} color={c.teal} icon="key" small /> : null}
            {a.yield_pct ? <Pill label={`Yield ${percent(a.yield_pct)} / year`} color={c.teal} small /> : null}
            <Pill label={`${a.days_held} days held`} color={c.gray} icon="time" small />
          </View>
          <View style={{ marginTop: 16, gap: 9 }}>
            <Line label="Purchase price" value={money(a.purchase_price)} />
            <Line label="Setup costs (buying, repairs)" value={money(a.capital_total)} />
            <Line label="Total invested" value={money(a.invested)} bold />
            <View style={{ height: 0.5, backgroundColor: c.separator }} />
            <Line label={`Rent received (${incomes.length})`} value={money(a.income_total)} />
            <Line label="Running costs" value={`− ${money(a.running_total)}`} muted />
            <Line label="Net earned" value={money(a.net_rent, { sign: true })} bold />
          </View>
          <View style={{ marginTop: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
              <Text style={[type.caption, { color: c.text2 }]}>Investment paid back</Text>
              <Text style={[type.caption, { color: c.teal }]}>{percent(Math.max(0, a.payback_pct || 0))}</Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: c.fill }}>
              <View style={{ width: `${Math.min(100, Math.max(1, a.payback_pct || 0))}%`, height: 6, borderRadius: 3, backgroundColor: c.teal }} />
            </View>
          </View>
        </Card>
      ) : null}

      {/* Profit card */}
      {!renting ? (
      <Card style={{ marginHorizontal: 16, marginTop: 12 }}>
        <Text style={[type.footnote, { color: c.text2, fontWeight: '600' }]}>{sold ? 'Profit' : 'Expected profit (at asking price)'}</Text>
        <Text style={[type.numberXL, { color: resultColor }]} numberOfLines={1} adjustsFontSizeToFit>
          {result === null ? 'Set asking price' : money(result, { sign: true })}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          {result !== null ? <Pill label={`ROI ${percent(sold ? a.roi : (a.expected_profit / a.cost) * 100)}`} color={resultColor} small /> : null}
          <Pill label={`${a.days_held} days held`} color={c.gray} icon="time" small />
          {over && !sold ? <Pill label={`Costs ${a.expense_ratio.toFixed(0)}% of price`} color={c.orange} icon="warning" small /> : null}
        </View>

        <View style={{ marginTop: 16, gap: 9 }}>
          <Line label="Purchase price" value={money(a.purchase_price)} />
          <Line label={`Expenses (${expenses.length})`} value={money(a.direct_total)} />
          <View style={{ height: 0.5, backgroundColor: c.separator }} />
          <Line label="Total cost" value={money(a.cost)} bold />
          <Line label={sold ? 'Sale price' : 'Asking price'} value={sold ? money(a.sale_price) : a.asking_price ? money(a.asking_price) : '—'} />
          {!sold && a.asking_price ? <Line label="Break-even price" value={money(a.cost)} muted /> : null}
        </View>

        {/* Expense limit bar */}
        <View style={{ marginTop: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
            <Text style={[type.caption, { color: c.text2 }]}>Expenses vs purchase price</Text>
            <Text style={[type.caption, { color: over ? c.orange : c.text2 }]}>{percent(a.expense_ratio)} / {settings.alert_percent}% limit</Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: c.fill }}>
            <View style={{ width: `${Math.min(100, (a.expense_ratio / settings.alert_percent) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: over ? c.orange : c.green }} />
          </View>
        </View>
      </Card>
      ) : null}

      {/* Actions */}
      <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 12 }}>
        {renting ? <Button title="Rent in" icon="key" color={c.teal} style={{ flex: 1 }} onPress={() => navigation.navigate('IncomeForm', { asset_id: id })} /> : null}
        <Button title="Expense" icon="add" kind="tinted" style={{ flex: 1 }} onPress={() => navigation.navigate('ExpenseForm', { asset_id: id })} />
        {sold ? (
          <Button title="Undo sale" icon="arrow-undo" kind="tinted" color={c.orange} style={{ flex: 1 }} onPress={() => setStatus(rent ? 'Vacant' : 'Listed')} />
        ) : !renting ? (
          <Button title="Sell" icon="cash" color={c.green} style={{ flex: 1 }} onPress={() => navigation.navigate('SellAsset', { id })} />
        ) : null}
      </View>
      {renting ? (
        <Pressable onPress={() => navigation.navigate('SellAsset', { id })} style={{ alignSelf: 'center', padding: 10 }}>
          <Text style={{ color: c.green, fontSize: 15, fontWeight: '600' }}>Sell this asset instead</Text>
        </Pressable>
      ) : null}

      {/* Rent payments */}
      {rent ? (
        <>
          <SectionHeader title="Rent payments" action={renting ? 'Add' : null} onAction={() => navigation.navigate('IncomeForm', { asset_id: id })} />
          <Card style={{ marginHorizontal: 16 }} padded={false}>
            {incomes.length === 0 ? (
              <Text style={[type.subhead, { color: c.text2, padding: 16 }]}>No rent recorded yet.</Text>
            ) : incomes.map((r, i) => (
              <Pressable key={r.id} onPress={() => navigation.navigate('IncomeForm', { id: r.id })}
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: i ? 0.5 : 0, borderTopColor: c.separator }, pressed && { backgroundColor: c.fill2 }]}>
                <IconTile name="key" color={c.teal} size={30} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.subhead, { color: c.text, fontWeight: '500' }]}>{r.period ? monthLabel(r.period) : r.income_type}</Text>
                  <Text style={[type.footnote, { color: c.text2 }]} numberOfLines={1}>Received {prettyDate(r.date)}{r.note ? ` · ${r.note}` : ''}</Text>
                </View>
                <Text style={[type.subhead, { color: c.green, fontWeight: '600', fontVariant: ['tabular-nums'] }]}>{money(r.amount, { sign: true })}</Text>
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}

      {/* Pie */}
      {expenses.length ? (
        <>
          <SectionHeader title="Cost breakdown" />
          <Card style={{ marginHorizontal: 16 }}>
            <Segmented value={by} onChange={setBy} options={[{ value: 'phase', label: 'By phase' }, { value: 'category', label: 'By category' }]} style={{ marginBottom: 16 }} />
            <Donut data={pie} size={190} thickness={24} centerTitle="Expenses" />
          </Card>
        </>
      ) : null}

      {/* Timeline by phase */}
      <SectionHeader title="Expense timeline" action="Add" onAction={() => navigation.navigate('ExpenseForm', { asset_id: id })} />
      {phaseGroups.length === 0 ? (
        <Card style={{ marginHorizontal: 16 }}><Text style={[type.subhead, { color: c.text2 }]}>No expenses recorded yet.</Text></Card>
      ) : phaseGroups.map((g) => (
        <Card key={g.phase} style={{ marginHorizontal: 16, marginBottom: 10 }} padded={false}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, paddingBottom: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c[PHASES[g.phase].color] }} />
            <Text style={[type.headline, { color: c.text, flex: 1 }]}>{g.phase}</Text>
            <Text style={[type.subhead, { color: c.text, fontWeight: '700', fontVariant: ['tabular-nums'] }]}>{money(g.total)}</Text>
          </View>
          {g.items.map((e) => (
            <Pressable key={e.id} onPress={() => navigation.navigate('ExpenseForm', { id: e.id })}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: c.separator }, pressed && { backgroundColor: c.fill2 }]}>
              <IconTile name={categoryIcon('Direct', e.category)} color={c[PHASES[g.phase].color]} size={30} />
              <View style={{ flex: 1 }}>
                <Text style={[type.subhead, { color: c.text, fontWeight: '500' }]} numberOfLines={1}>{e.category}</Text>
                <Text style={[type.footnote, { color: c.text2 }]} numberOfLines={1}>{[prettyDate(e.date), e.note].filter(Boolean).join(' · ')}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[type.subhead, { color: c.text, fontWeight: '600', fontVariant: ['tabular-nums'] }]}>{money(e.amount)}</Text>
                <Text style={[type.caption2, { color: c.text3, fontWeight: '500' }]}>total {moneyShort(runningById[e.id])}</Text>
              </View>
            </Pressable>
          ))}
        </Card>
      ))}

      {/* Details */}
      <SectionHeader title="Details" />
      <Card style={{ marginHorizontal: 16, gap: 10 }}>
        <Line label={t.idLabel} value={a.identifier} />
        <Line label="Bought on" value={prettyDate(a.purchase_date)} />
        {a.seller_name ? <Line label="Seller" value={a.seller_name} /> : null}
        {rent && a.tenant_name ? <Line label={a.type === 'Vehicle' ? 'Hired by' : 'Tenant'} value={a.tenant_name} /> : null}
        {rent && a.tenant_phone ? (
          <Pressable onPress={() => callTenant(a.tenant_phone)} hitSlop={6}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[type.subhead, { color: c.text2 }]}>Tenant phone</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="call" size={15} color={c.green} />
              <Text style={[type.subhead, { color: c.green, fontWeight: '600' }]}>{a.tenant_phone}</Text>
            </View>
          </Pressable>
        ) : null}
        {rent && a.rent_start ? <Line label="Rent since" value={prettyDate(a.rent_start)} /> : null}
        {t.fields.map((f) => (a.details[f.key] ? (
          <Line key={f.key} label={f.label} value={f.numeric && f.key !== 'year' ? Number(a.details[f.key]).toLocaleString('en-US') : a.details[f.key]} />
        ) : null))}
        {sold ? (
          <>
            <View style={{ height: 0.5, backgroundColor: c.separator }} />
            <Line label="Sold on" value={prettyDate(a.sale_date)} />
            {a.buyer_name ? <Line label="Buyer" value={a.buyer_name} /> : null}
            {a.buyer_phone ? <Line label="Buyer phone" value={a.buyer_phone} /> : null}
          </>
        ) : null}
        {a.notes ? <Text style={[type.subhead, { color: c.text2, marginTop: 4 }]}>{a.notes}</Text> : null}
      </Card>

      <Pressable onPress={remove} style={{ alignItems: 'center', padding: 20, marginTop: 10 }}>
        <Text style={{ color: c.red, fontSize: 17 }}>Delete asset</Text>
      </Pressable>
    </Screen>
  );
}

// Opens the phone dialer with the tenant's number
function callTenant(phone) {
  const number = String(phone).replace(/[^0-9+]/g, '');
  Linking.openURL(`tel:${number}`).catch(() => {});
}

function Line({ label, value, bold, muted }) {
  const { c, type } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={[type.subhead, { color: c.text2 }]}>{label}</Text>
      <Text style={[type.subhead, { color: muted ? c.text2 : c.text, fontWeight: bold ? '700' : '500', fontVariant: ['tabular-nums'], flexShrink: 1, textAlign: 'right' }]}>{value}</Text>
    </View>
  );
}
