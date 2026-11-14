// Legacy scheduler fixtures select legacy turns deliberately. Dedicated
// financial/returns jobs and the production cutoff have separate cron tests.
export function nextLegacyCronTime(value){
 if(!Number.isSafeInteger(value)||value<1)throw new TypeError('LEGACY_CRON_CLOCK_INVALID');
 while([0,2,5,7].includes(Math.floor(value/60000)%10))value+=60000;
 return value;
}
export function alignLegacyCronClock(clock){clock.time=nextLegacyCronTime(clock.time);return clock.time;}
