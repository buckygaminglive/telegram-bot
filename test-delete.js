const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'c:/Users/gaikw/OneDrive/Desktop/Bhavesh Things/Chicken Shop Weighing Machine APP/sanket-whatsapp-bot/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkDeletes() {
    const { data: before } = await supabase.from('app_logs').select('id');
    console.log('Before count:', before?.length);

    const { error: err2, data: delData } = await supabase.from('app_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000').select();
    console.log('Delete error:', err2, 'Deleted count:', delData?.length);

    const { data: after } = await supabase.from('app_logs').select('id');
    console.log('After count:', after?.length);
}
checkDeletes();
