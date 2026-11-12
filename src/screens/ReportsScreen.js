import React, { useCallback, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { Screen, Card, SectionHeader, Segmented, IconTile, Empty, haptic } from '../components/ui';
import { Donut, BarList, TrendBars } from '../components/charts';
import { Loading } from '../components/rows';
import { getMonthReport, getMonthlyTrend, getOverallReport } from '../db/repo';
import { useScope, SCOPE_TINT } from '../utils/scope';
import { ASSET_TYPES, PHASES, TYPE_PLURAL } from '../constants';
import { money, moneyShort, monthName, monthShort, percent, prettyDate } from '../utils/format';

export default function ReportsScreen({ navigation }) {
  const { c } = useTheme();
  const { type: scope } = useScope();
  const now = new Date();
  const [view, setView] = useState('month');
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [month, setMonth] = useState(null);
  const [trend, setTrend] = useState([]);
  const [overall, setOverall] = useState(null);

  const load = useCallback(async () => {
    setMonth(await getMonthReport(ym.y, ym.m, scope));
    setTrend(await getMonthlyTrend(6, scope));
    setOverall(await getOverallReport(scope));
  }, [ym, scope]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shift = (n) => {
    haptic.tap();
    const d = new Date(ym.y, ym.m + n, 1);
    if (d > now) return;
    setYm({ y: d.getFullYear(), m: d.getMonth() });
  };
  const isCurrent = ym.y === now.getFullYear() && ym.m === now.getMonth();

  if (!month || !overall) return <Loading />;

  // No assets yet: nothing to report
  if (overall.byType.length === 0) {
    return (
      <Screen title="Reports" subtitle={scope === 'All' ? null : TYPE_PLURAL[scope]}>
        <Empty
          icon="pie-chart-outline"
          title="No reports yet"
          message="Add an asset and its expenses. Your monthly profit, rent income and charts will appear here."
          action="Add an asset"
          onAction={() => navigation.navigate('AssetForm', scope !== 'All' ? { type: scope } : {})}
        />
      </Screen>
    );
  }

  return (
    <Screen
      title="Reports"
      subtitle={scope === 'All' ? null : TYPE_PLURAL[scope]}
      headerExtra={
        <Segmented value={view} onChange={setView} style={{ marginTop: 12 }}
          options={[{ value: 'month', label: 'Month end' }, { value: 'all', label: 'All time' }]} />
      }
    >
      {view === 'month'
        ? <MonthView r={month} trend={trend} ym={ym} isCurrent={isCurrent} shift={shift} navigation={navigation} scope={scope} />
        : <OverallView r={overall} navigation={navigation} scope={scope} />}
    </Screen>
  );
}

function MonthView({ r, trend, ym, isCurrent, shift, navigation, scope }) {
  const { c, type, chart } = useTheme();
  const all = scope === 'All';
  const good = r.net >= 0;
  const accent = c[SCOPE_TINT[scope]];
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 14 }}>
        <Pressable onPress={() => shift(-1)} hitSlop={12} style={{ padding: 6 }}><Ionicons name="chevron-back" size={22} color={accent} /></Pressable>
        <Text style={[type.title3, { color: c.text }]}>{monthName(ym.m)} {ym.y}</Text>
        <Pressable onPress={() => shift(1)} hitSlop={12} style={{ padding: 6, opacity: isCurrent ? 0.25 : 1 }} disabled={isCurrent}>
          <Ionicons name="chevron-forward" size={22} color={accent} />
        </Pressable>
      </View>

      <Card style={{ marginHorizontal: 16, marginTop: 10 }}>
        <Text style={[type.footnote, { color: c.text2, fontWeight: '600' }]}>{all ? 'Net profit' : 'Profit'}{isCurrent ? ' so far' : ''}</Text>
        <Text style={[type.numberXL, { color: good ? c.green : c.red }]} numberOfLines={1} adjustsFontSizeToFit>{money(r.net, { sign: true })}</Text>
        {r.sold.length === 0 && r.incomes.length === 0 ? (
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4 }}>
            <Ionicons name="information-circle" size={15} color={c.orange} />
            <Text style={[type.footnote, { color: c.orange, flex: 1 }]}>No sales or rent this month yet.</Text>
          </View>
        ) : null}

        <View style={{ marginTop: 16, gap: 9 }}>
          <Head label="Selling" />
          <L label={`Profit from sales (${r.sold.length} sold)`} value={money(r.salesGain, { sign: true })} />
          <Head label="Renting" />
          <L label={`Rent received (${r.incomes.length})`} value={money(r.rentIncome)} />
          <L label="Running costs of rentals" value={`− ${money(r.runningTotal)}`} muted />
          <Divider />
          <L label="Gross profit" value={money(r.gross, { sign: true })} bold color={r.gross >= 0 ? c.green : c.red} />
          {all ? (
            <>
              <Head label="Overhead (indirect)" />
              {r.indirect.length ? r.indirect.map((x) => <L key={x.label} label={x.label} value={`− ${money(x.value)}`} muted small />) : (
                <Text style={[type.footnote, { color: c.text3 }]}>None recorded</Text>
              )}
              <L label="Total overhead" value={`− ${money(r.indirectTotal)}`} />
              <Divider thick />
              <L label="Net profit" value={money(r.net, { sign: true })} bold big color={good ? c.green : c.red} />
            </>
          ) : (
            <Text style={[type.caption, { color: c.text3, fontWeight: '400', marginTop: 4 }]}>
              Overhead (fuel, phone, office, staff) is shared by the whole business, so it is deducted in All assets.
            </Text>
          )}
        </View>
      </Card>

      {r.sold.length ? (
        <>
          <SectionHeader title="Sold this month" />
          <Card style={{ marginHorizontal: 16 }} padded={false}>
            {r.sold.map((a, i) => (
              <Pressable key={a.id} onPress={() => navigation.navigate('AssetDetail', { id: a.id })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: i ? 0.5 : 0, borderTopColor: c.separator }}>
                <IconTile name={ASSET_TYPES[a.type].icon} color={c[ASSET_TYPES[a.type].color]} size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.subhead, { color: c.text, fontWeight: '600' }]} numberOfLines={1}>{a.identifier}</Text>
                  <Text style={[type.footnote, { color: c.text2 }]}>{prettyDate(a.sale_date)} · {a.days_held} days · ROI {percent(a.roi)}</Text>
                </View>
                <Text style={[type.subhead, { color: a.sale_gain >= 0 ? c.green : c.red, fontWeight: '700', fontVariant: ['tabular-nums'] }]}>{moneyShort(a.sale_gain, { sign: true })}</Text>
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}

      {r.incomes.length ? (
        <>
          <SectionHeader title="Rent received" />
          <Card style={{ marginHorizontal: 16 }} padded={false}>
            {r.incomes.map((x, i) => (
              <Pressable key={x.id} onPress={() => navigation.navigate('AssetDetail', { id: x.asset_id })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: i ? 0.5 : 0, borderTopColor: c.separator }}>
                <IconTile name={ASSET_TYPES[x.type].icon} color={c[ASSET_TYPES[x.type].color]} size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.subhead, { color: c.text, fontWeight: '600' }]} numberOfLines={1}>{x.identifier}</Text>
                  <Text style={[type.footnote, { color: c.text2 }]}>{x.income_type} · {prettyDate(x.date)}</Text>
                </View>
                <Text style={[type.subhead, { color: c.green, fontWeight: '700', fontVariant: ['tabular-nums'] }]}>{moneyShort(x.amount, { sign: true })}</Text>
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}

      {all && r.indirect.length ? (
        <>
          <SectionHeader title="Overhead breakdown" />
          <Card style={{ marginHorizontal: 16 }}>
            <Donut data={r.indirect.map((x, i) => ({ ...x, color: chart(i) }))} size={170} centerTitle="Overhead" />
          </Card>
        </>
      ) : null}

      <SectionHeader title="Money spent this month" />
      <Card style={{ marginHorizontal: 16, gap: 9 }}>
        <L label={`Bought (${r.purchasesCount})`} value={money(r.purchasesTotal)} />
        <L label="Expenses on assets" value={money(r.directSpent)} />
        {all ? <L label="Overhead" value={money(r.indirectTotal)} /> : null}
        <Divider />
        <L label="Total money out" value={money(r.purchasesTotal + r.directSpent + r.indirectTotal)} bold />
        <Text style={[type.caption, { color: c.text3, fontWeight: '400' }]}>
          Expenses on assets for sale count in profit when the asset is sold.
        </Text>
      </Card>

      <SectionHeader title={`${all ? 'Net profit' : 'Profit'} · last 6 months`} />
      <Card style={{ marginHorizontal: 16 }}>
        <TrendBars
          data={trend.map((t) => ({ value: t.net, active: t.year === ym.y && t.month === ym.m }))}
          labels={trend.map((t) => monthShort(t.month))}
        />
      </Card>
    </>
  );
}

function OverallView({ r, navigation, scope }) {
  const { c, type, chart } = useTheme();
  const all = scope === 'All';
  return (
    <>
      <Card style={{ marginHorizontal: 16, marginTop: 14 }}>
        <Text style={[type.footnote, { color: c.text2, fontWeight: '600' }]}>{all ? 'Net profit, all time' : 'Earned, all time'}</Text>
        <Text style={[type.numberXL, { color: r.netAll >= 0 ? c.green : c.red }]} numberOfLines={1} adjustsFontSizeToFit>{money(r.netAll, { sign: true })}</Text>
        <View style={{ marginTop: 12, gap: 9 }}>
          <L label={`From selling (${r.soldCount} sold)`} value={money(r.salesEarned, { sign: true })} />
          <L label={`From renting (${r.rentalCount} rentals)`} value={money(r.rentEarned, { sign: true })} />
          {all ? <L label="Overhead" value={`− ${money(r.indirectAll)}`} muted /> : null}
        </View>
      </Card>

      <View style={{ flexDirection: 'row', marginHorizontal: 10, marginTop: 6 }}>
        <Kpi icon="trending-up" color={c.green} label="Avg sale ROI" value={percent(r.avgRoi)} />
        <Kpi icon="time" color={c.orange} label="Days to sell" value={`${r.avgDays}`} />
        <Kpi icon="key" color={c.teal} label="Rent yield" value={`${percent(r.avgYield)}`} />
      </View>
      {r.best ? (
        <Pressable onPress={() => navigation.navigate('AssetDetail', { id: r.best.id })}>
          <Text style={[type.footnote, { color: c.text2, marginHorizontal: 20, marginTop: 4 }]}>
            Best deal: <Text style={{ color: c.blue }}>{r.best.identifier}</Text> ({moneyShort(r.best.profit, { sign: true })})
          </Text>
        </Pressable>
      ) : null}

      <SectionHeader title="Selling vs renting" />
      <Card style={{ marginHorizontal: 16 }}>
        <BarList
          data={[
            { label: 'Selling', value: r.salesEarned, color: c.purple },
            { label: 'Renting', value: r.rentEarned, color: c.teal },
          ]}
          formatter={(v) => moneyShort(v, { sign: true })}
        />
      </Card>

      {all ? (
        <>
          <SectionHeader title="Earned by asset type" />
          <Card style={{ marginHorizontal: 16 }}>
            <BarList
              data={r.byType.map((t) => ({ label: `${TYPE_PLURAL[t.type]} · ${t.count} assets`, value: t.earned, color: c[ASSET_TYPES[t.type].color] }))}
              formatter={(v) => moneyShort(v, { sign: true })}
            />
          </Card>
        </>
      ) : null}

      {r.directByPhase.length ? (
        <>
          <SectionHeader title="Expenses by phase" />
          <Card style={{ marginHorizontal: 16 }}>
            <Donut data={r.directByPhase.map((x) => ({ ...x, color: c[(PHASES[x.label] || { color: 'gray' }).color] }))} size={170} centerTitle="Expenses" />
          </Card>
          <SectionHeader title="Expenses by category" />
          <Card style={{ marginHorizontal: 16 }}>
            <BarList data={r.directByCategory.map((x, i) => ({ ...x, color: chart(i) }))} />
          </Card>
        </>
      ) : null}

      {all && r.indirectByCategory.length ? (
        <>
          <SectionHeader title="Overhead by category" />
          <Card style={{ marginHorizontal: 16 }}>
            <Donut data={r.indirectByCategory.map((x, i) => ({ ...x, color: chart(i) }))} size={170} centerTitle="Overhead" />
          </Card>
        </>
      ) : null}
    </>
  );
}

function Head({ label }) {
  const { c, type } = useTheme();
  return <Text style={[type.caption, { color: c.text2, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: '600' }]}>{label}</Text>;
}

function L({ label, value, bold, muted, small, big, color }) {
  const { c, type } = useTheme();
  const base = big ? type.headline : small ? type.footnote : type.subhead;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingLeft: small ? 10 : 0 }}>
      <Text style={[base, { color: bold ? c.text : c.text2, fontWeight: bold ? '700' : '400', flex: 1 }]} numberOfLines={1}>{label}</Text>
      <Text style={[base, { color: color || (muted ? c.text2 : c.text), fontWeight: bold ? '700' : '500', fontVariant: ['tabular-nums'] }]}>{value}</Text>
    </View>
  );
}

function Divider({ thick }) {
  const { c } = useTheme();
  return <View style={{ height: thick ? 1 : 0.5, backgroundColor: c.separator, marginVertical: 2 }} />;
}

function Kpi({ icon, color, label, value }) {
  const { c, type } = useTheme();
  return (
    <View style={{ flex: 1, padding: 6 }}>
      <Card style={{ padding: 14 }}>
        <IconTile name={icon} color={color} size={26} />
        <Text style={[type.caption, { color: c.text2, marginTop: 8 }]} numberOfLines={1}>{label}</Text>
        <Text style={[type.headline, { color: c.text, fontVariant: ['tabular-nums'] }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      </Card>
    </View>
  );
}
